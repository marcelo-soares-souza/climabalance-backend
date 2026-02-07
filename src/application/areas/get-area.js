import { ForbiddenError, NotFoundError } from '../../domain/errors';
export async function getArea(deps, areaId, userId, roles) {
    const area = await deps.areaRepository.findById(areaId);
    if (!area) {
        throw new NotFoundError('area.not_found');
    }
    // Authorization check (owner, or public if active)
    if (!area.isActive()) {
        const isPrivileged = roles?.includes('administrator') || roles?.includes('analyst');
        if (!isPrivileged && (!userId || area.ownerUserId !== userId)) {
            throw new ForbiddenError('area.not_owner');
        }
    }
    // Load criteria if area has been audited
    const criteria = area.auditStatus
        ? await deps.areaCriteriaRepository.findByAreaId(areaId)
        : [];
    return {
        id: area.id,
        ownerUserId: area.ownerUserId,
        name: area.name,
        description: area.description,
        latitude: area.location.latitude,
        longitude: area.location.longitude,
        biome: area.biome?.toString(),
        state: area.state,
        city: area.city,
        status: area.status.toString(),
        auditStatus: area.auditStatus?.toString(),
        auditNotes: area.auditNotes,
        auditedByUserId: area.auditedByUserId,
        auditedAt: area.auditedAt,
        totalCapacityTCO2e: area.carbonCapacity?.totalCapacityTCO2e,
        committedTCO2e: area.carbonCapacity?.committedTCO2e,
        availableTCO2e: area.carbonCapacity?.availableTCO2e,
        tCO2ePerTreePerYear: area.tCO2ePerTreePerYear,
        createdAt: area.createdAt,
        updatedAt: area.updatedAt,
        criteria: criteria.map((c) => ({
            criterionKey: c.criterionKey,
            criterionLabel: c.criterionLabel,
            met: c.met,
            notes: c.notes,
        })),
    };
}
