export interface SatelliteImageStorage {
  save(
    imageId: string,
    bytes: Uint8Array,
    mimeType: string,
  ): Promise<{ storagePath: string }>;
  saveThumbnail(
    imageId: string,
    bytes: Uint8Array,
  ): Promise<{ thumbnailPath: string }>;
  read(storagePath: string): Promise<Uint8Array>;
  delete(storagePath: string): Promise<void>;
}
