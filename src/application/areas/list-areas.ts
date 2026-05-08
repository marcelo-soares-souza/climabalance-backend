import { AreaRepository, AreaFilters } from '../../domain/areas/repositories/area-repository';
import { AreaMediaRepository } from '../../domain/areas/repositories/area-media-repository';
import { Area } from '../../domain/areas/entities/area';
import { AreaStatus } from '../../domain/areas/value-objects/area-status';
import { Biome } from '../../domain/areas/value-objects/biome';
import type { UserRepository } from '../../domain/user/user-repository';

export interface ListAreasRequest {
  userId?: string;
  roles?: string[];
  status?: string;
  biome?: string;
  ownerUserId?: string;
  onlyActive?: boolean;
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface AreaListItem {
  id: string;
  ownerUserId: string;
  ownerSlug?: string;
  name: string;
  slug: string;
  description?: string;
  latitude: number;
  longitude: number;
  biome?: string;
  countryCode?: string;
  state?: string;
  city?: string;
  status: string;
  totalCapacityTCO2e?: number;
  committedTCO2e?: number;
  availableTCO2e?: number;
  maxPurchasableTrees?: number | null;
  tCO2ePerTreePerYear?: number;
  estimatedKgCO2PerTreePerYear?: number;
  pricePerTree?: number;
  defaultHorizonYears?: number;
  thumbnailUrl?: string;
  imageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedAreasResult {
  data: AreaListItem[];
  nextCursor?: string;
}

export interface ListAreasDeps {
  areaRepository: AreaRepository;
  areaMediaRepository: AreaMediaRepository;
  userRepository?: Pick<UserRepository, 'findById'>;
}

const PRIVILEGED_ROLES = ['administrator', 'analyst'];

function isPrivileged(roles?: string[]): boolean {
  return roles?.some((r) => PRIVILEGED_ROLES.includes(r)) ?? false;
}

export async function listAreas(
  deps: ListAreasDeps,
  request: ListAreasRequest
): Promise<PaginatedAreasResult> {
  const isPaginated = request.cursor !== undefined || request.limit !== undefined;
  const pageSize = request.limit ?? 20;
  const filters: AreaFilters = isPaginated ? { limit: pageSize + 1 } : {};

  if (request.onlyActive) {
    filters.status = AreaStatus.ACTIVE;
  } else if (request.status) {
    filters.status = AreaStatus.fromString(request.status);
  }

  if (request.biome) {
    filters.biome = new Biome(request.biome);
  }

  if (request.cursor) {
    filters.cursor = request.cursor;
  } else if (request.offset) {
    filters.offset = request.offset;
  }

  if (request.onlyActive) {
    // Public listing: show all active areas regardless of auth
  } else if (isPrivileged(request.roles)) {
    // Privileged users (admin/analyst): can filter by ownerUserId or see all
    if (request.ownerUserId) {
      filters.ownerUserId = request.ownerUserId;
    }
  } else if (request.userId) {
    if (request.ownerUserId && request.ownerUserId !== request.userId) {
      // Non-privileged user viewing another user's areas: only show active
      filters.ownerUserId = request.ownerUserId;
      filters.status = AreaStatus.ACTIVE;
    } else {
      // Non-privileged user viewing own areas: show all statuses
      filters.ownerUserId = request.userId;
    }
  } else {
    // Unauthenticated: only show active areas
    filters.status = AreaStatus.ACTIVE;
    if (request.ownerUserId) {
      filters.ownerUserId = request.ownerUserId;
    }
  }

  const areas = await deps.areaRepository.findAll(filters);

  let pageAreas: Area[];
  let nextCursor: string | undefined;

  if (isPaginated) {
    const hasNextPage = areas.length > pageSize;
    pageAreas = hasNextPage ? areas.slice(0, pageSize) : areas;
    nextCursor = hasNextPage ? pageAreas[pageAreas.length - 1].id : undefined;
  } else {
    pageAreas = areas;
  }

  const areaIds = pageAreas.map((a) => a.id);
  const ownerIds = [...new Set(pageAreas.map((a) => a.ownerUserId))];
  const allMedia = areaIds.length > 0
    ? await deps.areaMediaRepository.listByAreaIds(areaIds)
    : [];
  const owners = deps.userRepository && ownerIds.length > 0
    ? await Promise.all(ownerIds.map(async (ownerId) => deps.userRepository!.findById(ownerId)))
    : [];
  const ownerSlugById = new Map(
    owners
      .filter((owner): owner is NonNullable<typeof owner> => owner != null)
      .map((owner) => [owner.id, owner.slug])
  );

  const mediaByAreaId = new Map<string, { thumbnailUrl: string; imageUrl: string }>();
  const usedAreas = new Set<string>();
  const shuffled = allMedia.sort(() => Math.random() - 0.5);
  for (const media of shuffled) {
    if (!usedAreas.has(media.areaId)) {
      usedAreas.add(media.areaId);
      mediaByAreaId.set(media.areaId, {
        thumbnailUrl: `/api/v1/areas/media/${media.id}/thumbnail`,
        imageUrl: `/api/v1/areas/media/${media.id}/file`,
      });
    }
  }

  const data = pageAreas.map((area) => {
    const media = mediaByAreaId.get(area.id);
    return {
      id: area.id,
      ownerUserId: area.ownerUserId,
      ownerSlug: ownerSlugById.get(area.ownerUserId),
      name: area.name,
      slug: area.slug,
      description: area.description,
      latitude: area.location.latitude,
      longitude: area.location.longitude,
      biome: area.biome?.toString(),
      countryCode: area.countryCode,
      state: area.state,
      city: area.city,
      status: area.status.toString(),
      totalCapacityTCO2e: area.carbonCapacity?.totalCapacityTCO2e,
      committedTCO2e: area.carbonCapacity?.committedTCO2e,
      availableTCO2e: area.carbonCapacity?.availableTCO2e,
      maxPurchasableTrees: area.maxPurchasableTrees,
      tCO2ePerTreePerYear: area.tCO2ePerTreePerYear,
      estimatedKgCO2PerTreePerYear:
        area.tCO2ePerTreePerYear !== undefined
          ? area.tCO2ePerTreePerYear * 1000
          : undefined,
      pricePerTree: area.pricePerTree,
      defaultHorizonYears: area.defaultHorizonYears,
      thumbnailUrl: media?.thumbnailUrl || undefined,
      imageUrl: media?.imageUrl || undefined,
      createdAt: area.createdAt,
      updatedAt: area.updatedAt,
    };
  });

  return { data, nextCursor };
}
