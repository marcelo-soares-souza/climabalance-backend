import type { AreaRepository } from "../../domain/areas/repositories/area-repository";
import type { AreaMediaRepository } from "../../domain/areas/repositories/area-media-repository";
import type { AreaMediaStorage } from "../../domain/areas/services/area-media-storage";
import { ForbiddenError, NotFoundError } from "../../domain/errors";
import { canManageAreaMedia } from "./area-media-policy";

export async function deleteAreaMedia(
  deps: {
    areaRepository: AreaRepository;
    areaMediaRepository: AreaMediaRepository;
    areaMediaStorage: AreaMediaStorage;
    clock: { now(): Date };
    auditLog: {
      log(entry: {
        actorUserId: string;
        action: string;
        entityType: string;
        entityId: string;
        metadata?: Record<string, any>;
      }): Promise<void>;
    };
  },
  input: {
    mediaId: string;
    actorUserId: string;
    actorRoles: string[];
  },
): Promise<void> {
  const media = await deps.areaMediaRepository.findById(input.mediaId);
  if (!media) {
    throw new NotFoundError("area.media_not_found");
  }

  const area = await deps.areaRepository.findById(media.areaId);
  if (!area) {
    throw new NotFoundError("area.not_found");
  }

  if (!canManageAreaMedia(area, input.actorUserId, input.actorRoles)) {
    throw new ForbiddenError("area.not_owner");
  }

  const now = deps.clock.now();
  await deps.areaMediaRepository.softDelete(media.id, now);
  await deps.areaMediaStorage.delete(media.storagePath);
  if (media.thumbnailStoragePath) {
    try {
      await deps.areaMediaStorage.delete(media.thumbnailStoragePath);
    } catch {
      // Best-effort cleanup.
    }
  }

  await deps.auditLog.log({
    actorUserId: input.actorUserId,
    action: "area.media.deleted",
    entityType: "area_media",
    entityId: media.id,
    metadata: {
      area_id: area.id,
    },
  });
}
