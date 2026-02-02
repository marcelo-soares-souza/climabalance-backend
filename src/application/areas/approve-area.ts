import { AreaAuditService } from '../../domain/areas/services/area-audit.service';

export interface ApproveAreaRequest {
  areaId: string;
  analystId: string;
  criteria: Array<{
    criterionKey: string;
    criterionLabel: string;
    met: boolean;
    notes?: string;
  }>;
  notes?: string;
}

export interface ApproveAreaDeps {
  auditService: AreaAuditService;
}

export async function approveArea(
  deps: ApproveAreaDeps,
  request: ApproveAreaRequest
): Promise<void> {
  await deps.auditService.approveArea(
    request.areaId,
    request.analystId,
    request.criteria,
    request.notes
  );
}
