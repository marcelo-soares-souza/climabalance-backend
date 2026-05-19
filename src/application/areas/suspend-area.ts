import { AreaAuditService } from "../../domain/areas/services/area-audit.service";

export interface SuspendAreaDeps {
  auditService: AreaAuditService;
}

export async function suspendArea(
  deps: SuspendAreaDeps,
  areaId: string,
  userId: string,
): Promise<void> {
  await deps.auditService.suspendArea(areaId, userId);
}
