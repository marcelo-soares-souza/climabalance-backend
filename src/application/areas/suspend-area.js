export async function suspendArea(deps, areaId, userId) {
    await deps.auditService.suspendArea(areaId, userId);
}
