import { beforeEach, describe, expect, test } from 'bun:test';
import { Area } from '../src/domain/areas/entities/area';
import { Location } from '../src/domain/areas/value-objects/location';
import { AreaStatus } from '../src/domain/areas/value-objects/area-status';
import { uploadAreaMedia } from '../src/application/areas/upload-area-media';
import { listAreaMedia } from '../src/application/areas/list-area-media';
import { getAreaMediaFile } from '../src/application/areas/get-area-media-file';
import { deleteAreaMedia } from '../src/application/areas/delete-area-media';
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

  async updateThumbnail(_id: string, _thumbnailStoragePath: string, _thumbnailGeneratedAt: Date): Promise<void> {}
}

class MemoryAreaMediaStorage implements AreaMediaStorage {
  private files = new Map<string, Uint8Array>();
  lastSavedPath: string | null = null;

  async save(params: {
    mediaId: string;
    uploadedByUserId: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ storagePath: string }> {
    const storagePath = `memory://${params.uploadedByUserId}/${params.mediaId}`;
    this.files.set(storagePath, params.bytes);
    this.lastSavedPath = storagePath;
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
    return this.files.has(storagePath);
  }

  async generateThumbnail(_storagePath: string): Promise<{ thumbnailStoragePath: string; bytes: Uint8Array }> {
    return { thumbnailStoragePath: '', bytes: new Uint8Array(0) };
  }
}

const now = new Date('2026-02-07T00:00:00Z');

async function buildPngBufferFn(): Promise<Uint8Array> {
  const size = 64;
  const channels = 4;
  const raw = new Uint8Array(size * size * channels);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * channels;
      raw[i] = 255; raw[i + 1] = 0; raw[i + 2] = 0; raw[i + 3] = 255;
    }
  }
  const sharp = (await import('sharp')).default;
  return new Uint8Array(await sharp(Buffer.from(raw), { raw: { width: size, height: size, channels } }).png().toBuffer());
}

function buildMp4Buffer(): Uint8Array {
  return new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
  ]);
}



describe('area media flow', () => {
  let areaRepository: MemoryAreaRepository;
  let areaMediaRepository: MemoryAreaMediaRepository;
  let areaMediaStorage: MemoryAreaMediaStorage;
  let ids = 0;

  beforeEach(() => {
    areaRepository = new MemoryAreaRepository();
    areaMediaRepository = new MemoryAreaMediaRepository();
    areaMediaStorage = new MemoryAreaMediaStorage();
    ids = 0;

    areaRepository.add(
      new Area({
        id: 'area-1',
        ownerUserId: 'owner-1',
        name: 'Area 1',
        location: new Location(-15, -47),
        status: AreaStatus.DRAFT,
        createdAt: now,
        updatedAt: now,
      })
    );
    areaRepository.add(
      new Area({
        id: 'area-2',
        ownerUserId: 'owner-2',
        name: 'Area 2',
        location: new Location(-15.1, -47.1),
        status: AreaStatus.ACTIVE,
        createdAt: now,
        updatedAt: now,
      })
    );
  });

  test('owner uploads, lists, reads and deletes photo media', async () => {
    const upload = await uploadAreaMedia(
      {
        areaRepository,
        areaMediaRepository,
        areaMediaStorage,
        idGenerator: {
          generate: () => `media-${++ids}`,
        },
        clock: {
          now: () => now,
        },
        auditLog: {
          async log() {},
        },
      },
      {
        areaId: 'area-1',
        actorUserId: 'owner-1',
        actorRoles: ['producer'],
        mediaType: 'photo',
        description: 'Vista frontal da área com árvores nativas',
        mimeType: 'image/png',
        fileName: 'evidence.png',
        fileBuffer: await buildPngBufferFn(),
      }
    );

    expect(upload.id).toBe('media-1');
    expect(areaMediaStorage.lastSavedPath).toBe('memory://owner-1/media-1');
    const savedMedia = await areaMediaRepository.findById(upload.id);
    expect(savedMedia?.storagePath).toBe('memory://owner-1/media-1');
    expect(savedMedia?.mimeType).toBe('image/webp');

    const listed = await listAreaMedia(
      {
        areaRepository,
        areaMediaRepository,
      },
      {
        areaId: 'area-1',
        actorUserId: 'owner-1',
        actorRoles: ['producer'],
      }
    );
    expect(listed.length).toBe(1);
    expect(listed[0].fileName).toBe('evidence.png');
    expect(listed[0].description).toBe('Vista frontal da área com árvores nativas');

    const file = await getAreaMediaFile(
      {
        areaRepository,
        areaMediaRepository,
        areaMediaStorage,
      },
      {
        mediaId: upload.id,
        actorUserId: 'owner-1',
        actorRoles: ['producer'],
      }
    );
    expect(file.mimeType).toBe('image/webp');
    expect(Buffer.from(file.bytes.slice(0, 4)).toString('ascii')).toBe('RIFF');
    expect(Buffer.from(file.bytes.slice(8, 12)).toString('ascii')).toBe('WEBP');

    await deleteAreaMedia(
      {
        areaRepository,
        areaMediaRepository,
        areaMediaStorage,
        clock: {
          now: () => new Date('2026-02-07T00:10:00Z'),
        },
        auditLog: {
          async log() {},
        },
      },
      {
        mediaId: upload.id,
        actorUserId: 'owner-1',
        actorRoles: ['producer'],
      }
    );

    const afterDelete = await listAreaMedia(
      {
        areaRepository,
        areaMediaRepository,
      },
      {
        areaId: 'area-1',
        actorUserId: 'owner-1',
        actorRoles: ['producer'],
      }
    );
    expect(afterDelete.length).toBe(0);
  });

  test('non owner cannot upload media to draft area', async () => {
    await expect(
      uploadAreaMedia(
        {
          areaRepository,
          areaMediaRepository,
          areaMediaStorage,
          idGenerator: {
            generate: () => `media-${++ids}`,
          },
          clock: { now: () => now },
          auditLog: {
            async log() {},
          },
        },
        {
          areaId: 'area-1',
          actorUserId: 'other-user',
          actorRoles: ['producer'],
          mediaType: 'photo',
          mimeType: 'image/png',
          fileName: 'x.png',
          fileBuffer: new Uint8Array([0]),
        }
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('public can list/read media from active area', async () => {
    const upload = await uploadAreaMedia(
      {
        areaRepository,
        areaMediaRepository,
        areaMediaStorage,
        idGenerator: {
          generate: () => `media-${++ids}`,
        },
        clock: {
          now: () => now,
        },
        auditLog: {
          async log() {},
        },
      },
      {
        areaId: 'area-2',
        actorUserId: 'owner-2',
        actorRoles: ['producer'],
        mediaType: 'video',
        mimeType: 'video/mp4',
        fileName: 'walkthrough.mp4',
        fileBuffer: buildMp4Buffer(),
      }
    );

    const listed = await listAreaMedia(
      {
        areaRepository,
        areaMediaRepository,
      },
      {
        areaId: 'area-2',
      }
    );
    expect(listed.length).toBe(1);
    expect(listed[0].mediaType).toBe('video');

    const file = await getAreaMediaFile(
      {
        areaRepository,
        areaMediaRepository,
        areaMediaStorage,
      },
      {
        mediaId: upload.id,
      }
    );
    expect(Buffer.from(file.bytes.slice(4, 8)).toString('ascii')).toBe('ftyp');
  });

  test('reject upload with mismatched mime type', async () => {
    await expect(
      uploadAreaMedia(
        {
          areaRepository,
          areaMediaRepository,
          areaMediaStorage,
          idGenerator: {
            generate: () => `media-${++ids}`,
          },
          clock: {
            now: () => now,
          },
          auditLog: {
            async log() {},
          },
        },
        {
          areaId: 'area-1',
          actorUserId: 'owner-1',
          actorRoles: ['producer'],
          mediaType: 'photo',
          mimeType: 'image/png',
          fileName: 'invalid.png',
          fileBuffer: new Uint8Array([0xff, 0xd8, 0xff]), // JPEG header claiming PNG
        }
      )
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
