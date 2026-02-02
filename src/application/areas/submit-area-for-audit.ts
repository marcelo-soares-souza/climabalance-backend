import { AreaAuditService } from '../../domain/areas/services/area-audit.service';

export interface SubmitAreaForAuditDeps {
  auditService: AreaAuditService;
}

export async function submitAreaForAudit(
  deps: SubmitAreaForAuditDeps,
  areaId: string,
  userId: string
): Promise<void> {
  await deps.auditService.submitForAudit(areaId, userId);
}
