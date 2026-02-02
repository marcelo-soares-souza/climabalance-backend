import { AreaRepository } from '../../domain/areas/repositories/area-repository';
import { AreaCriteriaRepository } from '../../domain/areas/repositories/area-criteria-repository';

export interface GetAreaResponse {
  id: string;
  ownerUserId: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  biome?: string;
  state?: string;
  city?: string;
  status: string;
  auditStatus?: string;
  auditNotes?: string;
  auditedByUserId?: string;
  auditedAt?: Date;
  totalCapacityTCO2e?: number;
  committedTCO2e?: number;
  availableTCO2e?: number;
  tCO2ePerTreePerYear?: number;
  createdAt: Date;
  updatedAt: Date;
  criteria?: Array<{
    criterionKey: string;
    criterionLabel: string;
    met: boolean;
    notes?: string;
  }>;
}

export interface GetAreaDeps {
  areaRepository: AreaRepository;
  criteriaRepository: AreaCriteriaRepository;
}

export async function getArea(
  deps: GetAreaDeps,
  areaId: string,
  userId: string
): Promise<GetAreaResponse> {
  const area = await deps.areaRepository.findById(areaId);

  if (!area) {
    throw new Error('Area not found');
  }

  // Authorization check (owner, or public if active)
  if (area.ownerUserId !== userId && !area.isActive()) {
    throw new Error('Access denied');
  }

  // Load criteria if area has been audited
  const criteria = area.auditStatus
    ? await deps.criteriaRepository.findByAreaId(areaId)
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
