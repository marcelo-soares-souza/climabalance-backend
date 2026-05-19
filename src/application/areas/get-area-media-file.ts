import type { AreaRepository } from "../../domain/areas/repositories/area-repository";
import type { AreaMediaRepository } from "../../domain/areas/repositories/area-media-repository";
import type { AreaMediaStorage } from "../../domain/areas/services/area-media-storage";
import { ForbiddenError, NotFoundError } from "../../domain/errors";
import { canReadAreaMedia } from "./area-media-policy";

export type GetAreaMediaFileResult = {
  mediaId: string;
  mimeType: string;
  fileName: string;
  bytes: Uint8Array;
};

export async function getAreaMediaFile(
  deps: {
    areaRepository: AreaRepository;
    areaMediaRepository: AreaMediaRepository;
    areaMediaStorage: AreaMediaStorage;
  },
  input: {
    mediaId: string;
    actorUserId?: string;
    actorRoles?: string[];
  },
): Promise<GetAreaMediaFileResult> {
  const media = await deps.areaMediaRepository.findById(input.mediaId);
  if (!media) {
    throw new NotFoundError("area.media_not_found");
  }

  const area = await deps.areaRepository.findById(media.areaId);
  if (!area) {
    throw new NotFoundError("area.not_found");
  }

  if (!canReadAreaMedia(area, input.actorUserId, input.actorRoles)) {
    throw new ForbiddenError("area.not_owner");
  }

  const bytes = await deps.areaMediaStorage.read(media.storagePath);
  return {
    mediaId: media.id,
    mimeType: media.mimeType,
    fileName: media.originalFileName,
    bytes,
  };
}
