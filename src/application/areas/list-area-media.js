import { ForbiddenError, NotFoundError } from '../../domain/errors';
import { canReadAreaMedia } from './area-media-policy';
export async function listAreaMedia(deps, input) {
    const area = await deps.areaRepository.findById(input.areaId);
    if (!area) {
        throw new NotFoundError('area.not_found');
    }
    if (!canReadAreaMedia(area, input.actorUserId, input.actorRoles)) {
        throw new ForbiddenError('area.not_owner');
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
