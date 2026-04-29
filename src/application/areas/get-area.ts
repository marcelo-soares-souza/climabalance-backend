import { AreaRepository } from '../../domain/areas/repositories/area-repository';
import { AreaCriteriaRepository } from '../../domain/areas/repositories/area-criteria-repository';
import type { UserRepository } from '../../domain/user/user-repository';
import { ForbiddenError, NotFoundError } from '../../domain/errors';

export interface GetAreaResponse {
  id: string;
  ownerUserId: string;
  ownerEmail?: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  biome?: string;
  countryCode?: string;
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
  estimatedKgCO2PerTreePerYear?: number;
  pricePerTree?: number;
  defaultHorizonYears?: number;
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
  areaCriteriaRepository: AreaCriteriaRepository;
  userRepository?: Pick<UserRepository, 'findById'>;
}

export async function getArea(
  deps: GetAreaDeps,
  areaId: string,
  userId?: string,
  roles?: string[]
): Promise<GetAreaResponse> {
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
  const owner = deps.userRepository
    ? await deps.userRepository.findById(area.ownerUserId)
    : null;

  return {
    id: area.id,
    ownerUserId: area.ownerUserId,
    ownerEmail: owner?.email,
    name: area.name,
    description: area.description,
    latitude: area.location.latitude,
    longitude: area.location.longitude,
    biome: area.biome?.toString(),
    countryCode: area.countryCode,
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
    estimatedKgCO2PerTreePerYear:
      area.tCO2ePerTreePerYear !== undefined
        ? area.tCO2ePerTreePerYear * 1000
        : undefined,
    pricePerTree: area.pricePerTree,
    defaultHorizonYears: area.defaultHorizonYears,
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
