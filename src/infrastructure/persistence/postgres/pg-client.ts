import { Pool } from "pg";
import { env } from "../../../shared/utils/env";
import { logger, serializeError } from "../../../shared/utils/logger";

export const pgPool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: env.databasePoolMax,
  idleTimeoutMillis: env.databaseIdleTimeoutMs,
  connectionTimeoutMillis: env.databaseConnectionTimeoutMs,
});

pgPool.on("error", (error) => {
  logger.error("database.pool.error", {
    error: serializeError(error),
  });
});

pgPool.on("connect", () => {
  logger.debug("database.pool.client_connected");
});

pgPool.on("acquire", () => {
  logger.debug("database.pool.client_acquired");
});

pgPool.on("remove", () => {
  logger.debug("database.pool.client_removed");
});
