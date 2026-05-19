import type { AreaRepository } from "../../domain/areas/repositories/area-repository";
import type { AreaMediaRepository } from "../../domain/areas/repositories/area-media-repository";
import { ForbiddenError, NotFoundError } from "../../domain/errors";
import { canReadAreaMedia } from "./area-media-policy";

export type ListAreaMediaResult = Array<{
  id: string;
  areaId: string;
  mediaType: "photo" | "video";
  description?: string;
  mimeType: string;
  fileName: string;
  fileSizeBytes: number;
  createdAt: Date;
}>;

export async function listAreaMedia(
  deps: {
    areaRepository: AreaRepository;
    areaMediaRepository: AreaMediaRepository;
  },
  input: {
    areaId: string;
    actorUserId?: string;
    actorRoles?: string[];
  },
): Promise<ListAreaMediaResult> {
  const area = await deps.areaRepository.findById(input.areaId);
  if (!area) {
    throw new NotFoundError("area.not_found");
  }

  if (!canReadAreaMedia(area, input.actorUserId, input.actorRoles)) {
    throw new ForbiddenError("area.not_owner");
  }

  const items = await deps.areaMediaRepository.listByAreaId(area.id);
  return items.map((item) => ({
    id: item.id,
    areaId: item.areaId,
    mediaType: item.mediaType,
    description: item.description ?? undefined,
    mimeType: item.mimeType,
    fileName: item.originalFileName,
    fileSizeBytes: item.fileSizeBytes,
    createdAt: item.createdAt,
  }));
}
