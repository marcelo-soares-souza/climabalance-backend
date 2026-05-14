import { AreaRepository } from '../../domain/areas/repositories/area-repository';
import { Location } from '../../domain/areas/value-objects/location';
import { Biome } from '../../domain/areas/value-objects/biome';
import { AreaStatus } from '../../domain/areas/value-objects/area-status';
import { slugify, slugWithSuffix } from '../../shared/utils/slugify';

export interface UpdateAreaRequest {
  userId: string;
  areaId: string;
  isAdmin?: boolean;
  name?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  biome?: string;
  countryCode?: string;
  state?: string;
  city?: string;
  totalCapacityTCO2e?: number;
  maxPurchasableTrees?: number | null;
  tCO2ePerTreePerYear?: number;
  pricePerTree?: number;
  defaultHorizonYears?: number;
  treeSpecies?: string;
  externalLink?: string;
  status?: string;
}

export interface UpdateAreaDeps {
  areaRepository: AreaRepository;
}

export async function updateArea(
  deps: UpdateAreaDeps,
  request: UpdateAreaRequest
): Promise<void> {
  const isAdmin = request.isAdmin ?? false;
  const area = await deps.areaRepository.findById(request.areaId);

  if (!area) {
    throw new Error('Area not found');
  }

  if (!area.canBeEditedBy(request.userId, isAdmin)) {
    throw new Error('User cannot edit this area');
  }

  const updates: any = {};

  if (request.name !== undefined) {
    updates.name = request.name;
    const baseSlug = slugify(request.name);
    const existing = await deps.areaRepository.findBySlug(baseSlug);
    if (!existing || existing.id === area.id) {
      updates.slug = baseSlug;
    } else {
      updates.slug = slugWithSuffix(baseSlug, area.id);
    }
  }
  if (request.description !== undefined) updates.description = request.description;
  if (request.countryCode !== undefined) updates.countryCode = request.countryCode;
  if (request.state !== undefined) updates.state = request.state;
  if (request.city !== undefined) updates.city = request.city;
  if (request.totalCapacityTCO2e !== undefined)
    updates.totalCapacityTCO2e = request.totalCapacityTCO2e;
  if (request.tCO2ePerTreePerYear !== undefined)
    updates.tCO2ePerTreePerYear = request.tCO2ePerTreePerYear;
  if (request.pricePerTree !== undefined) updates.pricePerTree = request.pricePerTree;
  if (request.defaultHorizonYears !== undefined)
    updates.defaultHorizonYears = request.defaultHorizonYears;
  if (request.maxPurchasableTrees !== undefined)
    updates.maxPurchasableTrees = request.maxPurchasableTrees;
  if (request.treeSpecies !== undefined) updates.treeSpecies = request.treeSpecies;
  if (request.externalLink !== undefined) updates.externalLink = request.externalLink;

  if (request.latitude !== undefined && request.longitude !== undefined) {
    updates.location = new Location(request.latitude, request.longitude);
  }

  if (request.biome !== undefined) {
    updates.biome = new Biome(request.biome);
  }

  if (request.maxPurchasableTrees !== undefined) {
    if (!isAdmin) {
      throw new Error('Only admin can update max purchasable trees');
    }
    if (request.maxPurchasableTrees !== null) {
      if (!Number.isInteger(request.maxPurchasableTrees) || request.maxPurchasableTrees < 1) {
        throw new Error('Max purchasable trees must be a positive integer or null');
      }
      const current = area.maxPurchasableTrees ?? 0;
      if (request.maxPurchasableTrees < current) {
        throw new Error('Max purchasable trees can only be increased');
      }
    }
  }

  area.update(updates, { forceEdit: isAdmin });

  if (request.status !== undefined) {
    if (!isAdmin) {
      throw new Error('Only admin can update area status');
    }
    area.status = AreaStatus.fromString(request.status);
    area.updatedAt = new Date();
  }

  await deps.areaRepository.update(area);
}
