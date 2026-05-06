import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { env } from '../../shared/utils/env';

function sanitizePathSegment(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  return sanitized || 'unknown-user';
}

export class LocalProfileAvatarStorage {
  constructor(private readonly basePath: string = env.profileAvatarStoragePath) {}

  async save(params: {
    userId: string;
    bytes: Uint8Array;
  }): Promise<{ storagePath: string }> {
    const userFolder = sanitizePathSegment(params.userId);
    const userPath = path.join(this.basePath, userFolder);
    await mkdir(userPath, { recursive: true });

    const resized = await sharp(params.bytes)
      .resize(400, 400, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const fileName = 'avatar.webp';
    const fullPath = path.join(userPath, fileName);
    await writeFile(fullPath, new Uint8Array(resized));
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
