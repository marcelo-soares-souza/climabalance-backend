import { AreaRepository } from '../../domain/areas/repositories/area-repository';
import { Area } from '../../domain/areas/entities/area';

export interface DeleteAreaRequest {
  userId: string;
  areaId: string;
  isAdmin?: boolean;
}

export interface DeleteAreaDeps {
  areaRepository: AreaRepository;
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

  await deps.areaRepository.delete(area.id);
}
