import { beforeEach, describe, expect, test } from 'bun:test';
import { updateArea } from '../src/application/areas/update-area';
import { Area } from '../src/domain/areas/entities/area';
import { AreaStatus } from '../src/domain/areas/value-objects/area-status';
import { Location } from '../src/domain/areas/value-objects/location';
import type { AreaRepository } from '../src/domain/areas/repositories/area-repository';

class MemoryAreaRepository implements Partial<AreaRepository> {
  private readonly areas = new Map<string, Area>();

  add(area: Area): void {
    this.areas.set(area.id, area);
  }

  async findById(id: string): Promise<Area | null> {
    return this.areas.get(id) ?? null;
  }

  async update(area: Area): Promise<void> {
    this.areas.set(area.id, area);
  }
}

describe('updateArea status changes', () => {
  let repository: MemoryAreaRepository;

  beforeEach(() => {
    repository = new MemoryAreaRepository();
    repository.add(
      new Area({
        id: 'area-1',
        ownerUserId: 'owner-1',
        name: 'Area',
        location: new Location(-15.7939, -47.8828),
        status: AreaStatus.ACTIVE,
        createdAt: new Date('2026-02-10T10:00:00Z'),
        updatedAt: new Date('2026-02-10T10:00:00Z'),
      })
    );
  });

  test('admin can change area status during edit', async () => {
    await updateArea(
      { areaRepository: repository as AreaRepository },
      {
        areaId: 'area-1',
        userId: 'admin-1',
        isAdmin: true,
        status: 'suspended',
      }
    );

    const updated = await repository.findById('area-1');
    expect(updated?.status.toString()).toBe('suspended');
  });

  test('non-admin cannot change area status', async () => {
    await expect(
      updateArea(
        { areaRepository: repository as AreaRepository },
        {
          areaId: 'area-1',
          userId: 'owner-1',
          isAdmin: false,
          status: 'suspended',
        }
      )
    ).rejects.toThrow('Only admin can update area status');

    const updated = await repository.findById('area-1');
    expect(updated?.status.toString()).toBe('active');
  });
});
