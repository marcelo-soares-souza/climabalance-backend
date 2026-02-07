import { Area } from '../../domain/areas/entities/area';
import { Location } from '../../domain/areas/value-objects/location';
import { AreaStatus } from '../../domain/areas/value-objects/area-status';
import { Biome } from '../../domain/areas/value-objects/biome';
import { CarbonCapacity } from '../../domain/areas/value-objects/carbon-capacity';
export async function createArea(deps, request) {
    // Validate and create location
    const location = new Location(request.latitude, request.longitude);
    // Parse biome if provided
    const biome = request.biome ? Biome.fromString(request.biome) : undefined;
    // Create carbon capacity if provided
    const carbonCapacity = request.totalCapacityTCO2e !== undefined
        ? new CarbonCapacity(request.totalCapacityTCO2e, 0)
        : undefined;
    // Create area entity
    const now = deps.clock.now();
    const area = new Area({
        id: deps.idGenerator.generate(),
        ownerUserId: request.ownerUserId,
        name: request.name,
        description: request.description,
        location,
        biome,
        state: request.state,
        city: request.city,
        status: AreaStatus.DRAFT,
        carbonCapacity,
        tCO2ePerTreePerYear: request.tCO2ePerTreePerYear,
        createdAt: now,
        updatedAt: now,
    });
    // Persist
    await deps.areaRepository.save(area);
    // Audit log
    await deps.auditLog.log({
        actorUserId: request.ownerUserId,
        action: 'area.created',
        entityType: 'area',
        entityId: area.id,
    });
    // Return response
    return {
        id: area.id,
        name: area.name,
        status: area.status.toString(),
        latitude: area.location.latitude,
        longitude: area.location.longitude,
        createdAt: area.createdAt,
    };
}
