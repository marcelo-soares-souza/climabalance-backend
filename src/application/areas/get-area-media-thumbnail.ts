import type { AreaRepository } from '../../domain/areas/repositories/area-repository';
import type { AreaMediaRepository } from '../../domain/areas/repositories/area-media-repository';
import type { AreaMediaStorage } from '../../domain/areas/services/area-media-storage';
import { ForbiddenError, NotFoundError } from '../../domain/errors';
import { canReadAreaMedia } from './area-media-policy';

const THUMBNAIL_MIME_TYPE = 'image/webp';

export type GetAreaMediaThumbnailResult = {
  mediaId: string;
  mimeType: string;
  bytes: Uint8Array;
};

export async function getAreaMediaThumbnail(
  deps: {
    areaRepository: AreaRepository;
    areaMediaRepository: AreaMediaRepository;
    areaMediaStorage: AreaMediaStorage;
    clock: { now(): Date };
  },
  input: {
    mediaId: string;
    actorUserId?: string;
    actorRoles?: string[];
  }
): Promise<GetAreaMediaThumbnailResult> {
  const media = await deps.areaMediaRepository.findById(input.mediaId);
  if (!media) {
    throw new NotFoundError('area.media_not_found');
  }

  const area = await deps.areaRepository.findById(media.areaId);
  if (!area) {
    throw new NotFoundError('area.not_found');
  }

  if (!canReadAreaMedia(area, input.actorUserId, input.actorRoles)) {
    throw new ForbiddenError('area.not_owner');
  }

  if (media.mediaType !== 'photo') {
    throw new NotFoundError('area.media_not_found');
  }

  if (media.thumbnailStoragePath) {
    const thumbnailExists = await deps.areaMediaStorage.exists(media.thumbnailStoragePath);
    if (thumbnailExists) {
      const bytes = await deps.areaMediaStorage.read(media.thumbnailStoragePath);
      return {
        mediaId: media.id,
        mimeType: THUMBNAIL_MIME_TYPE,
        bytes,
      };
    }
  }

  const { thumbnailStoragePath, bytes } = await deps.areaMediaStorage.generateThumbnail(media.storagePath);
  const now = deps.clock.now();
  await deps.areaMediaRepository.updateThumbnail(media.id, thumbnailStoragePath, now);

  return {
    mediaId: media.id,
    mimeType: THUMBNAIL_MIME_TYPE,
    bytes,
  };
}