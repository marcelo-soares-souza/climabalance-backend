export async function rejectArea(deps, areaId, analystId, reason) {
    await deps.auditService.rejectArea(areaId, analystId, reason);
}
