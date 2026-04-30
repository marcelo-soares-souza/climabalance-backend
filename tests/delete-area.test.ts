import { beforeEach, describe, expect, test } from 'bun:test';
import { deleteArea } from '../src/application/areas/delete-area';
import { Area } from '../src/domain/areas/entities/area';
import { AreaStatus } from '../src/domain/areas/value-objects/area-status';
import { Location } from '../src/domain/areas/value-objects/location';
import type { AreaRepository } from '../src/domain/areas/repositories/area-repository';
import type { AreaMedia, AreaMediaRepository } from '../src/domain/areas/repositories/area-media-repository';
import type { AreaMediaStorage } from '../src/domain/areas/services/area-media-storage';

class MemoryAreaRepository implements AreaRepository {
  private areas = new Map<string, Area>();

  add(area: Area): void {
    this.areas.set(area.id, area);
  }

  async save(_area: Area): Promise<void> {}

  async findById(id: string): Promise<Area | null> {
    const area = this.areas.get(id);
    if (!area || area.deletedAt) return null;
    return area;
  }

  async findByOwnerId(_ownerUserId: string): Promise<Area[]> {
    return [];
  }

  async findAll(): Promise<Area[]> {
    return [];
  }

  async findActiveWithCapacity(): Promise<Area[]> {
    return [];
  }

  async findWithinBounds(): Promise<Area[]> {
    return [];
  }

  async findNearest(): Promise<Area[]> {
    return [];
  }

  async update(_area: Area): Promise<void> {}

  async delete(id: string): Promise<void> {
    const area = this.areas.get(id);
    if (!area) return;
    area.softDelete();
    this.areas.set(id, area);
  }

  async exists(id: string): Promise<boolean> {
    return this.areas.has(id);
  }

  async count(): Promise<number> {
    return this.areas.size;
  }

  async getGlobalStats(): Promise<{ totalAreas: number; totalTreesPlanted: number; totalCO2Captured: number }> {
    return { totalAreas: 0, totalTreesPlanted: 0, totalCO2Captured: 0 };
  }
}

class MemoryAreaMediaRepository implements AreaMediaRepository {
  private items = new Map<string, AreaMedia>();

  seed(media: AreaMedia): void {
    this.items.set(media.id, media);
  }

  async create(media: AreaMedia): Promise<void> {
    this.items.set(media.id, media);
  }

  async findById(id: string): Promise<AreaMedia | null> {
    const media = this.items.get(id);
    if (!media || media.deletedAt) return null;
    return media;
  }

  async listByAreaId(areaId: string): Promise<AreaMedia[]> {
    return [...this.items.values()].filter((item) => item.areaId === areaId && !item.deletedAt);
  }

  async softDelete(id: string, deletedAt: Date): Promise<void> {
    const media = this.items.get(id);
    if (!media) return;
    this.items.set(id, { ...media, deletedAt, updatedAt: deletedAt });
  }
}

class MemoryAreaMediaStorage implements AreaMediaStorage {
  deletedPaths: string[] = [];

  async save(_params: {
    mediaId: string;
    uploadedByUserId: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ storagePath: string }> {
    return { storagePath: '' };
  }

  async read(): Promise<Uint8Array> {
    return new Uint8Array();
  }

  async delete(storagePath: string): Promise<void> {
    this.deletedPaths.push(storagePath);
  }
}

describe('deleteArea', () => {
  let areaRepository: MemoryAreaRepository;
  let areaMediaRepository: MemoryAreaMediaRepository;
  let areaMediaStorage: MemoryAreaMediaStorage;

  beforeEach(() => {
    areaRepository = new MemoryAreaRepository();
    areaMediaRepository = new MemoryAreaMediaRepository();
    areaMediaStorage = new MemoryAreaMediaStorage();

    areaRepository.add(
      new Area({
        id: 'area-1',
        ownerUserId: 'owner-1',
        name: 'Area 1',
        location: new Location(-15.7939, -47.8828),
        status: AreaStatus.ACTIVE,
        createdAt: new Date('2026-02-10T10:00:00Z'),
        updatedAt: new Date('2026-02-10T10:00:00Z'),
      })
    );

    areaMediaRepository.seed({
      id: 'media-1',
      areaId: 'area-1',
      uploadedByUserId: 'owner-1',
      mediaType: 'photo',
      description: 'photo',
      mimeType: 'image/jpeg',
      originalFileName: 'photo.jpg',
      storagePath: '/tmp/photo.jpg',
      fileSizeBytes: 100,
      createdAt: new Date('2026-02-10T10:00:00Z'),
      updatedAt: new Date('2026-02-10T10:00:00Z'),
      deletedAt: null,
    });

    areaMediaRepository.seed({
      id: 'media-2',
      areaId: 'area-1',
      uploadedByUserId: 'owner-1',
      mediaType: 'video',
      description: 'video',
      mimeType: 'video/mp4',
      originalFileName: 'video.mp4',
      storagePath: '/tmp/video.mp4',
      fileSizeBytes: 200,
      createdAt: new Date('2026-02-10T10:00:00Z'),
      updatedAt: new Date('2026-02-10T10:00:00Z'),
      deletedAt: null,
    });
  });

  test('owner can soft-delete area in active status and cascades media soft-delete', async () => {
    await deleteArea(
      {
        areaRepository,
        areaMediaRepository,
        areaMediaStorage,
        clock: { now: () => new Date('2026-02-14T10:00:00Z') },
      },
      {
        areaId: 'area-1',
        userId: 'owner-1',
      }
    );

    const area = await areaRepository.findById('area-1');
    expect(area).toBeNull();

    const media = await areaMediaRepository.listByAreaId('area-1');
    expect(media.length).toBe(0);
    expect(areaMediaStorage.deletedPaths).toEqual(['/tmp/photo.jpg', '/tmp/video.mp4']);
  });

  test('non-owner without admin cannot delete area', async () => {
    await expect(
      deleteArea(
        {
          areaRepository,
          areaMediaRepository,
          areaMediaStorage,
          clock: { now: () => new Date('2026-02-14T10:00:00Z') },
        },
        {
          areaId: 'area-1',
          userId: 'other-user',
        }
      )
    ).rejects.toThrow('User cannot delete this area');

    const area = await areaRepository.findById('area-1');
    expect(area).not.toBeNull();
    const media = await areaMediaRepository.listByAreaId('area-1');
    expect(media.length).toBe(2);
  });
});
