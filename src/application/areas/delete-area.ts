import { AreaRepository } from '../../domain/areas/repositories/area-repository';

export interface DeleteAreaDeps {
  areaRepository: AreaRepository;
}

export async function deleteArea(
  deps: DeleteAreaDeps,
  areaId: string,
  userId: string
): Promise<void> {
  const area = await deps.areaRepository.findById(areaId);

  if (!area) {
    throw new Error('Area not found');
  }

  if (!area.canBeDeletedBy(userId)) {
    throw new Error('User cannot delete this area');
  }

  area.softDelete();

  await deps.areaRepository.update(area);
}
