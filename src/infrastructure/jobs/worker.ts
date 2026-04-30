import { getLogger } from '../../shared/utils/logger';
import { numberEnv } from '../../shared/utils/env';
import type { PostgresJobRepository } from '../persistence/postgres/job-repository';
import type { JobHandlerDeps } from '../../application/jobs/handlers';
import {
  handleUserRegistered,
  handleAreaCreated,
  handleAuditRequested,
  handleAreaApproved,
  handleContributionReceived,
} from '../../application/jobs/handlers';

const HANDLERS: Record<
  string,
  (payload: any, deps: JobHandlerDeps) => Promise<void>
> = {
  'user.registered': handleUserRegistered,
  'area.created': handleAreaCreated,
  'area.audit_requested': handleAuditRequested,
  'area.approved': handleAreaApproved,
  'area.contribution_received': handleContributionReceived,
};

export function startJobWorker(
  jobRepo: PostgresJobRepository,
  deps: JobHandlerDeps,
): void {
  const log = getLogger();

  async function tick(): Promise<void> {
    try {
      const jobs = await jobRepo.acquirePending(10);
      for (const job of jobs) {
        const handler = HANDLERS[job.jobType];
        if (!handler) {
          log.warn('job.unknown_type', { job_type: job.jobType, job_id: job.id });
          await jobRepo.complete(job.id);
          continue;
        }

        try {
          log.info('job.processing', { job_type: job.jobType, job_id: job.id });
          await handler(job.payload as any, deps);
          await jobRepo.complete(job.id);
          log.info('job.completed', { job_type: job.jobType, job_id: job.id });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error('job.failed', { job_type: job.jobType, job_id: job.id, error: msg });
          await jobRepo.fail(job.id, msg);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('worker.tick_error', { error: msg });
    }
  }

  const intervalMs = numberEnv('JOB_POLL_INTERVAL_MS', 10_000);
  setInterval(tick, intervalMs);
  tick();
}
