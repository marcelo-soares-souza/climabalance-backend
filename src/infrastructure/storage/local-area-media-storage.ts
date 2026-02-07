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

export class LocalAreaMediaStorage implements AreaMediaStorage {
  constructor(private readonly basePath: string = process.env.AREA_MEDIA_STORAGE_PATH ?? './storage/area-media') {}

  async save(params: {
    mediaId: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ storagePath: string }> {
    await mkdir(this.basePath, { recursive: true });
    const ext = resolveExtension(params.mimeType);
    const fileName = `${params.mediaId}.${ext}`;
    const fullPath = path.join(this.basePath, fileName);
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
