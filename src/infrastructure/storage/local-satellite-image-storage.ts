import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SatelliteImageStorage } from '../../domain/areas/services/satellite-image-storage';

export class LocalSatelliteImageStorage implements SatelliteImageStorage {
  constructor(private readonly basePath: string) {}

  private async ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  async save(
    imageId: string,
    bytes: Uint8Array,
    mimeType: string,
  ): Promise<{ storagePath: string }> {
    const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const fileName = `${imageId}.${ext}`;
    const fullPath = path.join(this.basePath, fileName);
    await this.ensureDir(this.basePath);
    await writeFile(fullPath, bytes);
    return { storagePath: fullPath };
  }

  async saveThumbnail(
    imageId: string,
    bytes: Uint8Array,
  ): Promise<{ thumbnailPath: string }> {
    const thumbName = `${imageId}_thumb.webp`;
    const fullPath = path.join(this.basePath, thumbName);
    await this.ensureDir(this.basePath);
    await writeFile(fullPath, bytes);
    return { thumbnailPath: fullPath };
  }

  async read(storagePath: string): Promise<Uint8Array> {
    const content = await readFile(storagePath);
    return new Uint8Array(content);
  }

  async delete(storagePath: string): Promise<void> {
    await rm(storagePath, { force: true });
    const parsed = path.parse(storagePath);
    const thumbPath = path.join(parsed.dir, `${parsed.name}_thumb.webp`);
    await rm(thumbPath, { force: true }).catch(() => {});
  }
}
