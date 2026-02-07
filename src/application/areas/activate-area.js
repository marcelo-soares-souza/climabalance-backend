export async function activateArea(deps, areaId, userId) {
    await deps.auditService.activateArea(areaId, userId);
}
