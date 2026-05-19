import { pgPool } from "./infrastructure/persistence/postgres/pg-client";
import { buildAppRuntime } from "./infrastructure/bootstrap/build-app-runtime";
import { connectValkey } from "./infrastructure/cache/valkey-client";
import { env } from "./shared/utils/env";
import { logger } from "./shared/utils/logger";

const REQUEST_TIMEOUT_MS = 30_000;
const WEBHOOK_TIMEOUT_MS = 60_000;

// Verify TLS/HTTPS configuration in production
function verifyTlsConfig(): void {
  if (env.appEnv === "production" && !env.appUrl.startsWith("https://")) {
    throw new Error(
      "TLS required in production: APP_URL must start with https://",
    );
  }
}

// Verify database connectivity on startup
async function verifyDatabaseConnection(): Promise<void> {
  try {
    logger.info("startup.database.connecting");
    const client = await pgPool.connect();
    await client.query("SELECT 1");
    client.release();
    logger.info("startup.database.connected");
  } catch (error) {
    logger.error("startup.database.connection_failed", {
      message: error instanceof Error ? error.message : String(error),
      code:
        error instanceof Error && "code" in error
          ? (error as { code?: string }).code
          : undefined,
    });
    throw error;
  }
}

logger.info("startup.initializing");
logger.debug("startup.runtime.initializing");
const runtime = buildAppRuntime();
logger.info("storage.object.configured", runtime.storageLogMeta);
logger.info("email.configured", runtime.emailLogMeta);
logger.debug("startup.runtime.initialized");

// Main startup sequence
async function main() {
  try {
    verifyTlsConfig();
    await verifyDatabaseConnection();
    await connectValkey();

    logger.info("startup.server.starting", {
      port: runtime.port,
      url: runtime.url,
    });
    Bun.serve({
      port: runtime.port,
      fetch: (request: Request, server: Bun.Server<any>) => {
        const clientIp = server.requestIP(request)?.address;

        const isWebhook = request.url.includes("/payments/webhook");
        const timeoutMs = isWebhook ? WEBHOOK_TIMEOUT_MS : REQUEST_TIMEOUT_MS;

        const timeoutPromise = new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error("Request timed out")), timeoutMs),
        );

        const handlerPromise = runtime.router.handle(request, { clientIp });

        return Promise.race([handlerPromise, timeoutPromise]).catch((error) => {
          const status = error.message === "Request timed out" ? 503 : 500;
          return new Response(
            JSON.stringify({
              error: {
                message_key:
                  status === 503 ? "request.timeout" : "request.failed",
              },
            }),
            {
              status,
              headers: { "content-type": "application/json" },
            },
          );
        });
      },
    });

    logger.info("startup.complete", { url: runtime.url, port: runtime.port });
  } catch (error) {
    logger.error("startup.failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();
