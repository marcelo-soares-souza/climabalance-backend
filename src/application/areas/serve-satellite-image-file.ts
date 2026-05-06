import type { AreaSatelliteImageRepository } from '../../domain/areas/repositories/area-satellite-image-repository';
import type { SatelliteImageStorage } from '../../domain/areas/services/satellite-image-storage';
import { NotFoundError } from '../../domain/errors';

export interface ServeFileResult {
  bytes: Uint8Array;
  mimeType: string;
}

export async function serveSatelliteImageFile(
  deps: {
    satelliteImageRepository: AreaSatelliteImageRepository;
    satelliteImageStorage: SatelliteImageStorage;
  },
  imageId: string,
): Promise<ServeFileResult> {
  const image = await deps.satelliteImageRepository.findById(imageId);
  if (!image) {
    throw new NotFoundError('satellite.image_not_found');
  }

  const bytes = await deps.satelliteImageStorage.read(image.storagePath);
  return { bytes, mimeType: 'image/jpeg' };
}

export async function serveSatelliteImageThumbnail(
  deps: {
    satelliteImageRepository: AreaSatelliteImageRepository;
    satelliteImageStorage: SatelliteImageStorage;
  },
  imageId: string,
): Promise<ServeFileResult> {
  const image = await deps.satelliteImageRepository.findById(imageId);
  if (!image) {
    throw new NotFoundError('satellite.image_not_found');
  }

  const thumbPath = image.thumbnailPath ?? image.storagePath;
  const bytes = await deps.satelliteImageStorage.read(thumbPath);
  return { bytes, mimeType: image.thumbnailPath ? 'image/webp' : 'image/jpeg' };
}
