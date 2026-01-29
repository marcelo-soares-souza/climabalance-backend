import { Pool } from 'pg';
import { env } from '../../../shared/utils/env';

export const pgPool = new Pool({
  connectionString: env.databaseUrl
});
