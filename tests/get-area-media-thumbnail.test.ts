import { beforeEach, describe, expect, test } from 'bun:test';
import { Area } from '../src/domain/areas/entities/area';
import { Location } from '../src/domain/areas/value-objects/location';
import { AreaStatus } from '../src/domain/areas/value-objects/area-status';
import { getAreaMediaThumbnail } from '../src/application/areas/get-area-media-thumbnail';
import { NotFoundError } from '../src/domain/errors';
import type {
  AreaMedia,
  AreaMediaRepository
} from '../src/domain/areas/repositories/area-media-repository';
import type { AreaRepository } from '../src/domain/areas/repositories/area-repository';
import type { AreaMediaStorage } from '../src/domain/areas/services/area-media-storage';

class MemoryAreaRepository implements AreaRepository {
  private areas = new Map<string, Area>();

  add(area: Area): void {
    this.areas.set(area.id, area);
  }

  async save(_area: Area): Promise<void> {}

  async findById(id: string): Promise<Area | null> {
    return this.areas.get(id) ?? null;
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

  async delete(_id: string): Promise<void> {}

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
  lastUpdateThumbnail: { id: string; thumbnailStoragePath: string; thumbnailGeneratedAt: Date } | null = null;

  async create(media: AreaMedia): Promise<void> {
    this.items.set(media.id, media);
  }

  async findById(id: string): Promise<AreaMedia | null> {
    const item = this.items.get(id);
    if (!item || item.deletedAt) {
      return null;
    }
    return item;
  }

  async listByAreaId(areaId: string): Promise<AreaMedia[]> {
    return [...this.items.values()].filter(
      (item) => item.areaId === areaId && !item.deletedAt
    );
  }

  async listByAreaIds(areaIds: string[]): Promise<AreaMedia[]> {
    return [...this.items.values()].filter(
      (item) => areaIds.includes(item.areaId) && !item.deletedAt
    );
  }

  async softDelete(id: string, deletedAt: Date): Promise<void> {
    const item = this.items.get(id);
    if (!item) {
      return;
    }
    this.items.set(id, {
      ...item,
      deletedAt,
      updatedAt: deletedAt,
    });
  }

  async updateThumbnail(id: string, thumbnailStoragePath: string, thumbnailGeneratedAt: Date): Promise<void> {
    this.lastUpdateThumbnail = { id, thumbnailStoragePath, thumbnailGeneratedAt };
    const item = this.items.get(id);
    if (item) {
      this.items.set(id, {
        ...item,
        thumbnailStoragePath,
        thumbnailGeneratedAt,
        updatedAt: thumbnailGeneratedAt,
      });
    }
  }
}

class MemoryAreaMediaStorage implements AreaMediaStorage {
  private files = new Map<string, Uint8Array>();
  private generatedThumbnails = new Map<string, { thumbnailStoragePath: string; bytes: Uint8Array }>();
  public shouldExist = true;

  seedFile(path: string, bytes: Uint8Array): void {
    this.files.set(path, bytes);
  }

  async save(params: {
    mediaId: string;
    uploadedByUserId: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ storagePath: string }> {
    const storagePath = `memory://${params.uploadedByUserId}/${params.mediaId}`;
    this.files.set(storagePath, params.bytes);
    return { storagePath };
  }

  async read(storagePath: string): Promise<Uint8Array> {
    const data = this.files.get(storagePath);
    if (!data) {
      throw new Error('not found');
    }
    return data;
  }

  async delete(storagePath: string): Promise<void> {
    this.files.delete(storagePath);
  }

  async exists(storagePath: string): Promise<boolean> {
    return this.shouldExist && this.files.has(storagePath);
  }

  async generateThumbnail(storagePath: string): Promise<{ thumbnailStoragePath: string; bytes: Uint8Array }> {
    const cached = this.generatedThumbnails.get(storagePath);
    if (cached) return cached;

    const thumbPath = `${storagePath}_thumb.webp`;
    const thumbBytes = new Uint8Array([1, 2, 3, 4]);
    this.files.set(thumbPath, thumbBytes);
    const result = { thumbnailStoragePath: thumbPath, bytes: thumbBytes };
    this.generatedThumbnails.set(storagePath, result);
    return result;
  }
}

const now = new Date('2026-02-07T00:00:00Z');

describe('getAreaMediaThumbnail', () => {
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
        location: new Location(-15, -47),
        status: AreaStatus.ACTIVE,
        createdAt: now,
        updatedAt: now,
      })
    );
  });

  test('generates thumbnail on first request and returns webp', async () => {
    const media: AreaMedia = {
      id: 'media-1',
      areaId: 'area-1',
      uploadedByUserId: 'owner-1',
      mediaType: 'photo',
      mimeType: 'image/jpeg',
      originalFileName: 'test.jpg',
      storagePath: 'memory://owner-1/media-1',
      fileSizeBytes: 1000,
      thumbnailStoragePath: null,
      thumbnailGeneratedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    areaMediaStorage.save({
      mediaId: 'media-1',
      uploadedByUserId: 'owner-1',
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([255, 216, 255, 224]),
    });
    await areaMediaRepository.create(media);

    const result = await getAreaMediaThumbnail(
      {
        areaRepository,
        areaMediaRepository,
        areaMediaStorage,
        clock: { now: () => now },
      },
      { mediaId: 'media-1' }
    );

    expect(result.mimeType).toBe('image/webp');
    expect(result.mediaId).toBe('media-1');
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(areaMediaRepository.lastUpdateThumbnail).not.toBeNull();
    expect(areaMediaRepository.lastUpdateThumbnail!.thumbnailStoragePath).toContain('_thumb.webp');
  });

  test('returns cached thumbnail on subsequent requests', async () => {
    const media: AreaMedia = {
      id: 'media-1',
      areaId: 'area-1',
      uploadedByUserId: 'owner-1',
      mediaType: 'photo',
      mimeType: 'image/jpeg',
      originalFileName: 'test.jpg',
      storagePath: 'memory://owner-1/media-1',
      fileSizeBytes: 1000,
      thumbnailStoragePath: 'memory://owner-1/media-1_thumb',
      thumbnailGeneratedAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await areaMediaStorage.save({
      mediaId: 'media-1',
      uploadedByUserId: 'owner-1',
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([255, 216, 255, 224]),
    });

    const thumbBytes = new Uint8Array([5, 6, 7, 8]);
    areaMediaStorage.seedFile('memory://owner-1/media-1_thumb', thumbBytes);

    await areaMediaRepository.create(media);

    areaMediaStorage.shouldExist = true;

    const result = await getAreaMediaThumbnail(
      {
        areaRepository,
        areaMediaRepository,
        areaMediaStorage,
        clock: { now: () => now },
      },
      { mediaId: 'media-1' }
    );

    expect(result.mimeType).toBe('image/webp');
    expect(areaMediaRepository.lastUpdateThumbnail).toBeNull();
  });

  test('regenerates thumbnail when stored thumbnail file is missing', async () => {
    const media: AreaMedia = {
      id: 'media-1',
      areaId: 'area-1',
      uploadedByUserId: 'owner-1',
      mediaType: 'photo',
      mimeType: 'image/jpeg',
      originalFileName: 'test.jpg',
      storagePath: 'memory://owner-1/media-1',
      fileSizeBytes: 1000,
      thumbnailStoragePath: 'memory://owner-1/media-1_thumb.webp',
      thumbnailGeneratedAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await areaMediaStorage.save({
      mediaId: 'media-1',
      uploadedByUserId: 'owner-1',
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([255, 216, 255, 224]),
    });
    await areaMediaRepository.create(media);

    areaMediaStorage.shouldExist = false;

    const result = await getAreaMediaThumbnail(
      {
        areaRepository,
        areaMediaRepository,
        areaMediaStorage,
        clock: { now: () => now },
      },
      { mediaId: 'media-1' }
    );

    expect(result.mimeType).toBe('image/webp');
    expect(areaMediaRepository.lastUpdateThumbnail).not.toBeNull();
  });

  test('throws NotFoundError for video media type', async () => {
    const media: AreaMedia = {
      id: 'media-video',
      areaId: 'area-1',
      uploadedByUserId: 'owner-1',
      mediaType: 'video',
      mimeType: 'video/mp4',
      originalFileName: 'walkthrough.mp4',
      storagePath: 'memory://owner-1/media-video',
      fileSizeBytes: 5000,
      thumbnailStoragePath: null,
      thumbnailGeneratedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await areaMediaRepository.create(media);

    expect(
      getAreaMediaThumbnail(
        {
          areaRepository,
          areaMediaRepository,
          areaMediaStorage,
          clock: { now: () => now },
        },
        { mediaId: 'media-video' }
      )
    ).rejects.toThrow(NotFoundError);
  });

  test('throws NotFoundError for non-existent media', async () => {
    expect(
      getAreaMediaThumbnail(
        {
          areaRepository,
          areaMediaRepository,
          areaMediaStorage,
          clock: { now: () => now },
        },
        { mediaId: 'nonexistent' }
      )
    ).rejects.toThrow(NotFoundError);
  });
});