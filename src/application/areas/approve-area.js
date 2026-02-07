export async function approveArea(deps, request) {
    await deps.auditService.approveArea(request.areaId, request.analystId, request.criteria, request.notes);
}
