import { ForbiddenError, NotFoundError, ValidationError } from '../../domain/errors';
import { canManageAreaMedia } from './area-media-policy';
const maxImageBytes = 8 * 1024 * 1024;
const maxVideoBytes = 25 * 1024 * 1024;
const photoMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const videoMimeTypes = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
export async function uploadAreaMedia(deps, input) {
    const area = await deps.areaRepository.findById(input.areaId);
    if (!area) {
        throw new NotFoundError('area.not_found');
    }
    if (!canManageAreaMedia(area, input.actorUserId, input.actorRoles)) {
        throw new ForbiddenError('area.not_owner');
    }
    validateMimeType(input.mediaType, input.mimeType);
    let bytes;
    try {
        const decoded = Buffer.from(input.fileBase64, 'base64');
        bytes = new Uint8Array(decoded);
    }
    catch {
        throw new ValidationError([
            {
                field: 'file_base64',
                message: 'invalid_base64',
            },
        ]);
    }
    if (bytes.length === 0) {
        throw new ValidationError([
            {
                field: 'file_base64',
                message: 'empty_file',
            },
        ]);
    }
    const maxBytes = input.mediaType === 'photo' ? maxImageBytes : maxVideoBytes;
    if (bytes.length > maxBytes) {
        throw new ValidationError([
            {
                field: 'file_base64',
                message: 'file_too_large',
            },
        ]);
    }
    const now = deps.clock.now();
    const mediaId = deps.idGenerator.generate();
    const description = normalizeDescription(input.description);
    const storage = await deps.areaMediaStorage.save({
        mediaId,
        mimeType: input.mimeType,
        bytes,
    });
    await deps.areaMediaRepository.create({
        id: mediaId,
        areaId: area.id,
        uploadedByUserId: input.actorUserId,
        mediaType: input.mediaType,
        description,
        mimeType: input.mimeType,
        originalFileName: input.fileName,
        storagePath: storage.storagePath,
        fileSizeBytes: bytes.length,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    });
    await deps.auditLog.log({
        actorUserId: input.actorUserId,
        action: 'area.media.uploaded',
        entityType: 'area_media',
        entityId: mediaId,
        metadata: {
            area_id: area.id,
            media_type: input.mediaType,
            mime_type: input.mimeType,
            file_size_bytes: bytes.length,
            has_description: Boolean(description),
        },
    });
    return {
        id: mediaId,
        areaId: area.id,
        mediaType: input.mediaType,
        description,
        mimeType: input.mimeType,
        fileName: input.fileName,
        fileSizeBytes: bytes.length,
        createdAt: now,
    };
}
function validateMimeType(mediaType, mimeType) {
    if (mediaType === 'photo' && !photoMimeTypes.has(mimeType)) {
        throw new ValidationError([
            {
                field: 'mime_type',
                message: 'unsupported_mime_type',
            },
        ]);
    }
    if (mediaType === 'video' && !videoMimeTypes.has(mimeType)) {
        throw new ValidationError([
            {
                field: 'mime_type',
                message: 'unsupported_mime_type',
            },
        ]);
    }
}
function normalizeDescription(value) {
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    return trimmed;
}
