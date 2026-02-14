import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AreaMediaStorage } from '../../domain/areas/services/area-media-storage';

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

export class LocalAreaMediaStorage implements AreaMediaStorage {
  constructor(private readonly basePath: string = process.env.AREA_MEDIA_STORAGE_PATH ?? './storage/area-media') {}

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
}
