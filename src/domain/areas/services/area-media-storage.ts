export interface AreaMediaStorage {
  save(params: {
    mediaId: string;
    uploadedByUserId: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ storagePath: string }>;
  read(storagePath: string): Promise<Uint8Array>;
  delete(storagePath: string): Promise<void>;
  exists(storagePath: string): Promise<boolean>;
  generateThumbnail(storagePath: string): Promise<{ thumbnailStoragePath: string; bytes: Uint8Array }>;
}
