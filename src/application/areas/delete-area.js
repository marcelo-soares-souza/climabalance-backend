export async function deleteArea(deps, areaId, userId) {
    const area = await deps.areaRepository.findById(areaId);
    if (!area) {
        throw new Error('Area not found');
    }
    if (!area.canBeDeletedBy(userId)) {
        throw new Error('User cannot delete this area');
    }
    area.softDelete();
    await deps.areaRepository.update(area);
}
