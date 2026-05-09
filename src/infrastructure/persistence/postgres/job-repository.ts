import type { DbClient } from './db-client';
import type { EnqueueOptions } from '../../../domain/jobs/job-queue';
import { uuidv7 } from '../../../shared/utils/id';

export type JobRecord = {
  id: string;
  jobType: string;
  payload: unknown;
  status: 'pending' | 'running' | 'completed' | 'failed';
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  scheduledAt: Date;
};

export class PostgresJobRepository {
  constructor(private readonly db: DbClient) {}

  async enqueue(jobType: string, payload: object, opts?: EnqueueOptions): Promise<void> {
    const now = new Date();
    const delayMs = opts?.delayMs ?? 0;
    const scheduledAt = new Date(now.getTime() + delayMs);
    await this.db.query(
      `INSERT INTO job_queue (id, job_type, payload, status, scheduled_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', $4, $5, $5)`,
      [uuidv7(), jobType, JSON.stringify(payload), scheduledAt, now]
    );
  }

  async acquirePending(limit: number): Promise<JobRecord[]> {
    const result = await this.db.query(
      `UPDATE job_queue SET status = 'running', updated_at = NOW()
       WHERE id IN (
         SELECT id FROM job_queue
         WHERE status = 'pending' AND deleted_at IS NULL AND scheduled_at <= NOW()
         ORDER BY created_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [limit]
    );
    return result.rows.map(mapJob);
  }

  async complete(id: string): Promise<void> {
    await this.db.query(
      `UPDATE job_queue SET status = 'completed', updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
  }

  async fail(id: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE job_queue
       SET retry_count = retry_count + 1,
           last_error = $2,
           status = CASE WHEN retry_count + 1 >= max_retries THEN 'failed' ELSE 'pending' END,
           scheduled_at = CASE WHEN retry_count + 1 < max_retries THEN NOW() + interval '1 minute' * POWER(2, retry_count) ELSE scheduled_at END,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [id, error]
    );
  }
}

function mapJob(row: Record<string, unknown>): JobRecord {
  return {
    id: row.id as string,
    jobType: row.job_type as string,
    payload: row.payload,
    status: row.status as JobRecord['status'],
    retryCount: Number(row.retry_count),
    maxRetries: Number(row.max_retries),
    lastError: (row.last_error as string) ?? null,
    scheduledAt: new Date(row.scheduled_at as string),
  };
}
