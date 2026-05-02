import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AreaMediaStorage } from '../../domain/areas/services/area-media-storage';
import { env } from '../../shared/utils/env';

const extensionByMime: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

function resolveExtension(mimeType: string): string {
  return extensionByMime[mimeType] ?? 'bin';
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  return sanitized || 'unknown-user';
}

function thumbnailPathFor(storagePath: string): string {
  const parsed = path.parse(storagePath);
  return path.join(parsed.dir, `${parsed.name}_thumb.webp`);
}

export class LocalAreaMediaStorage implements AreaMediaStorage {
  constructor(private readonly basePath: string = env.areaMediaStoragePath) {}

  async save(params: {
    mediaId: string;
    uploadedByUserId: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ storagePath: string }> {
    const userFolder = sanitizePathSegment(params.uploadedByUserId);
    const userPath = path.join(this.basePath, userFolder);
    await mkdir(userPath, { recursive: true });
    const ext = resolveExtension(params.mimeType);
    const fileName = `${params.mediaId}.${ext}`;
    const fullPath = path.join(userPath, fileName);
    await writeFile(fullPath, params.bytes);
    return { storagePath: fullPath };
  }

  async read(storagePath: string): Promise<Uint8Array> {
    const content = await readFile(storagePath);
    return new Uint8Array(content);
  }

  async delete(storagePath: string): Promise<void> {
    await rm(storagePath, { force: true });
  }

  async exists(storagePath: string): Promise<boolean> {
    try {
      await stat(storagePath);
      return true;
    } catch {
      return false;
    }
  }

  async generateThumbnail(storagePath: string): Promise<{ thumbnailStoragePath: string; bytes: Uint8Array }> {
    const thumbPath = thumbnailPathFor(storagePath);
    const originalBytes = await readFile(storagePath);
    const thumbBuffer = await sharp(originalBytes)
      .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
    await mkdir(path.dirname(thumbPath), { recursive: true });
    await writeFile(thumbPath, thumbBuffer);
    return {
      thumbnailStoragePath: thumbPath,
      bytes: new Uint8Array(thumbBuffer),
    };
  }
}
