import { AreaAuditService } from '../../domain/areas/services/area-audit.service';

export interface RejectAreaDeps {
  auditService: AreaAuditService;
}

export async function rejectArea(
  deps: RejectAreaDeps,
  areaId: string,
  analystId: string,
  reason: string
): Promise<void> {
  await deps.auditService.rejectArea(areaId, analystId, reason);
}
