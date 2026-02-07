import { AreaStatus } from '../../domain/areas/value-objects/area-status';
import { Biome } from '../../domain/areas/value-objects/biome';
const PRIVILEGED_ROLES = ['administrator', 'analyst'];
function isPrivileged(roles) {
    return roles?.some((r) => PRIVILEGED_ROLES.includes(r)) ?? false;
}
export async function listAreas(deps, request) {
    const filters = {
        limit: request.limit,
        offset: request.offset,
    };
    if (request.status) {
        filters.status = AreaStatus.fromString(request.status);
    }
    if (request.biome) {
        filters.biome = Biome.fromString(request.biome);
    }
    if (request.ownerUserId) {
        filters.ownerUserId = request.ownerUserId;
    }
    else if (!isPrivileged(request.roles) && request.userId) {
        filters.ownerUserId = request.userId;
    }
    const areas = await deps.areaRepository.findAll(filters);
    return areas.map((area) => ({
        id: area.id,
        ownerUserId: area.ownerUserId,
        name: area.name,
        latitude: area.location.latitude,
        longitude: area.location.longitude,
        biome: area.biome?.toString(),
        status: area.status.toString(),
        availableTCO2e: area.carbonCapacity?.availableTCO2e,
        createdAt: area.createdAt,
    }));
}
