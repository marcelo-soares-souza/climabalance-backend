export async function submitAreaForAudit(deps, areaId, userId) {
    await deps.auditService.submitForAudit(areaId, userId);
}
