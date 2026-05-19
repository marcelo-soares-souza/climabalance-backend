import { getLogger } from "../../shared/utils/logger";
import { numberEnv, env } from "../../shared/utils/env";
import type { PostgresJobRepository } from "../persistence/postgres/job-repository";
import type { AuditLogRepository } from "../../domain/audit/audit-log-repository";
import type { JobHandlerDeps } from "../../application/jobs/handlers";
import {
  handleUserRegistered,
  handleAreaCreated,
  handleAuditRequested,
  handleAreaApproved,
  handleContributionReceived,
  handleAreaRejected,
  handleStripeOnboardingFailed,
  handleContributionRefunded,
  handleCompensationMilestone,
  handleCertificateIssued,
  handlePasswordChanged,
  handlePaymentFailed,
} from "../../application/jobs/handlers";

const HANDLERS: Record<
  string,
  (payload: any, deps: JobHandlerDeps) => Promise<void>
> = {
  "user.registered": handleUserRegistered,
  "area.created": handleAreaCreated,
  "area.audit_requested": handleAuditRequested,
  "area.approved": handleAreaApproved,
  "area.contribution_received": handleContributionReceived,
  "area.rejected": handleAreaRejected,
  "stripe.onboarding_failed": handleStripeOnboardingFailed,
  "contribution.refunded": handleContributionRefunded,
  "area.compensation_milestone": handleCompensationMilestone,
  "notification.certificate_issued": handleCertificateIssued,
  "notification.password_changed": handlePasswordChanged,
  "notification.payment_failed": handlePaymentFailed,
};

export function startJobWorker(
  jobRepo: PostgresJobRepository,
  deps: JobHandlerDeps,
  auditLog?: AuditLogRepository,
): void {
  const log = getLogger();

  if (auditLog) {
    const ARCHIVE_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const repo = auditLog;
    async function runAuditRetention(): Promise<void> {
      try {
        const result = await repo.archive(
          env.auditRetentionDays,
          env.auditArchiveDays,
        );
        if (result.archived > 0 || result.deleted > 0) {
          log.info("audit.retention.executed", result);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("audit.retention.failed", { error: msg });
      }
    }
    setInterval(runAuditRetention, ARCHIVE_INTERVAL_MS);
  }

  async function tick(): Promise<void> {
    try {
      const jobs = await jobRepo.acquirePending(10);
      for (const job of jobs) {
        const handler = HANDLERS[job.jobType];
        if (!handler) {
          log.warn("job.unknown_type", {
            job_type: job.jobType,
            job_id: job.id,
          });
          await jobRepo.complete(job.id);
          continue;
        }

        try {
          log.info("job.processing", { job_type: job.jobType, job_id: job.id });
          await handler(job.payload as any, deps);
          await jobRepo.complete(job.id);
          log.info("job.completed", { job_type: job.jobType, job_id: job.id });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error("job.failed", {
            job_type: job.jobType,
            job_id: job.id,
            error: msg,
          });
          await jobRepo.fail(job.id, msg);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("worker.tick_error", { error: msg });
    }
  }

  const intervalMs = numberEnv("JOB_POLL_INTERVAL_MS", 10_000);
  setInterval(tick, intervalMs);
  tick();
}
