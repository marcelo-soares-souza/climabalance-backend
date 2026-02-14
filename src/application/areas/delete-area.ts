import type { AreaRepository } from '../../domain/areas/repositories/area-repository';
import type { AreaMediaRepository } from '../../domain/areas/repositories/area-media-repository';
import type { AreaMediaStorage } from '../../domain/areas/services/area-media-storage';

export interface DeleteAreaRequest {
  userId: string;
  areaId: string;
  isAdmin?: boolean;
}

export interface DeleteAreaDeps {
  areaRepository: AreaRepository;
  areaMediaRepository: AreaMediaRepository;
  areaMediaStorage: AreaMediaStorage;
  clock: { now(): Date };
}

export async function deleteArea(
  deps: DeleteAreaDeps,
  request: DeleteAreaRequest
): Promise<void> {
  const area = await deps.areaRepository.findById(request.areaId);

  if (!area) {
    throw new Error('Area not found');
  }

  if (!area.canBeDeletedBy(request.userId, request.isAdmin ?? false)) {
    throw new Error('User cannot delete this area');
  }

  const deletedAt = deps.clock.now();
  const mediaItems = await deps.areaMediaRepository.listByAreaId(area.id);

  for (const media of mediaItems) {
    await deps.areaMediaRepository.softDelete(media.id, deletedAt);
    try {
      await deps.areaMediaStorage.delete(media.storagePath);
    } catch {
      // Keep soft-delete behavior even if physical file is already missing.
    }
  }

  await deps.areaRepository.delete(area.id);
}
