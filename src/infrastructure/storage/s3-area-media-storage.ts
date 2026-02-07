import type { AreaMediaStorage } from '../../domain/areas/services/area-media-storage';
import { S3CompatibleObjectStorage } from './s3-compatible-object-storage';

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

export class S3AreaMediaStorage implements AreaMediaStorage {
  constructor(
    private readonly objectStorage: S3CompatibleObjectStorage,
    private readonly prefix: string = 'area-media'
  ) {}

  async save(params: {
    mediaId: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ storagePath: string }> {
    const ext = resolveExtension(params.mimeType);
    const objectKey = `${this.prefix}/${params.mediaId}.${ext}`;
    const storagePath = await this.objectStorage.putObject({
      key: objectKey,
      bytes: params.bytes,
      contentType: params.mimeType,
    });
    return { storagePath };
  }

  async read(storagePath: string): Promise<Uint8Array> {
    return this.objectStorage.getObject(storagePath);
  }

  async delete(storagePath: string): Promise<void> {
    await this.objectStorage.deleteObject(storagePath);
  }
}
