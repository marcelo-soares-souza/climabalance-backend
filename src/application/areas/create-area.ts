import { Area } from '../../domain/areas/entities/area';
import { Location } from '../../domain/areas/value-objects/location';
import { AreaStatus } from '../../domain/areas/value-objects/area-status';
import { Biome } from '../../domain/areas/value-objects/biome';
import { CarbonCapacity } from '../../domain/areas/value-objects/carbon-capacity';
import { AreaRepository } from '../../domain/areas/repositories/area-repository';

export interface CreateAreaRequest {
  ownerUserId: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  biome?: string;
  state?: string;
  city?: string;
  totalCapacityTCO2e?: number;
  tCO2ePerTreePerYear?: number;
  pricePerTree?: number;
  defaultHorizonYears?: number;
}

export interface CreateAreaResponse {
  id: string;
  name: string;
  status: string;
  latitude: number;
  longitude: number;
  createdAt: Date;
}

export interface CreateAreaDeps {
  areaRepository: AreaRepository;
  idGenerator: { generate(): string };
  clock: { now(): Date };
  auditLog: {
    log(entry: {
      actorUserId: string;
      action: string;
      entityType: string;
      entityId: string;
    }): Promise<void>;
  };
}

export async function createArea(
  deps: CreateAreaDeps,
  request: CreateAreaRequest
): Promise<CreateAreaResponse> {
  // Validate and create location
  const location = new Location(request.latitude, request.longitude);

  // Parse biome if provided
  const biome = request.biome ? Biome.fromString(request.biome) : undefined;

  // Create carbon capacity if provided
  const carbonCapacity =
    request.totalCapacityTCO2e !== undefined
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
    pricePerTree: request.pricePerTree,
    defaultHorizonYears: request.defaultHorizonYears,
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
