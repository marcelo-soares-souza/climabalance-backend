import Redis from "ioredis";
import { env } from "../../shared/utils/env";
import { logger } from "../../shared/utils/logger";

export const valkey = new Redis(env.valkeyUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
});

valkey.on("connect", () => logger.info("valkey.connected"));
valkey.on("error", (err) =>
  logger.error("valkey.error", { error: err.message }),
);
valkey.on("close", () => logger.warn("valkey.closed"));

export async function connectValkey(): Promise<void> {
  try {
    await valkey.connect();
  } catch (error) {
    if (env.requireValkey) {
      logger.error("valkey.connect_failed", {
        msg: "valkey is required in this environment",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    logger.warn("valkey.connect_failed", { msg: "running without valkey" });
  }
}
