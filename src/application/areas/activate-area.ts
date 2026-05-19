import { AreaAuditService } from "../../domain/areas/services/area-audit.service";

export interface ActivateAreaDeps {
  auditService: AreaAuditService;
}

export async function activateArea(
  deps: ActivateAreaDeps,
  areaId: string,
  userId: string,
): Promise<void> {
  await deps.auditService.activateArea(areaId, userId);
}
