import sharp from "sharp";
import type { AreaRepository } from "../../domain/areas/repositories/area-repository";
import type {
  AreaMediaRepository,
  AreaMediaType,
} from "../../domain/areas/repositories/area-media-repository";
import type { AreaMediaStorage } from "../../domain/areas/services/area-media-storage";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../domain/errors";
import { canManageAreaMedia } from "./area-media-policy";

const maxImageBytes = 8 * 1024 * 1024;
const maxVideoBytes = 25 * 1024 * 1024;
const storedPhotoMimeType = "image/webp";

const photoMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const videoMimeTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export type UploadAreaMediaInput = {
  areaId: string;
  actorUserId: string;
  actorRoles: string[];
  mediaType: AreaMediaType;
  description?: string;
  mimeType: string;
  fileName: string;
  fileBuffer: Uint8Array;
};

export type UploadAreaMediaResult = {
  id: string;
  areaId: string;
  mediaType: AreaMediaType;
  description?: string;
  mimeType: string;
  fileName: string;
  fileSizeBytes: number;
  createdAt: Date;
};

export async function uploadAreaMedia(
  deps: {
    areaRepository: AreaRepository;
    areaMediaRepository: AreaMediaRepository;
    areaMediaStorage: AreaMediaStorage;
    idGenerator: { generate(): string };
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
  input: UploadAreaMediaInput,
): Promise<UploadAreaMediaResult> {
  const area = await deps.areaRepository.findById(input.areaId);
  if (!area) {
    throw new NotFoundError("area.not_found");
  }

  if (!canManageAreaMedia(area, input.actorUserId, input.actorRoles)) {
    throw new ForbiddenError("area.not_owner");
  }

  validateMimeType(input.mediaType, input.mimeType);

  const bytes = input.fileBuffer;

  if (bytes.length === 0) {
    throw new ValidationError([
      {
        field: "file",
        message: "empty_file",
      },
    ]);
  }

  const maxBytes = input.mediaType === "photo" ? maxImageBytes : maxVideoBytes;
  if (bytes.length > maxBytes) {
    throw new ValidationError([
      {
        field: "file",
        message: "file_too_large",
      },
    ]);
  }

  const prepared = await prepareUpload(input.mediaType, input.mimeType, bytes);
  const storedBytes = prepared.bytes;

  if (storedBytes.length > maxBytes) {
    throw new ValidationError([
      {
        field: "file_base64",
        message: "file_too_large",
      },
    ]);
  }

  const now = deps.clock.now();
  const mediaId = deps.idGenerator.generate();
  const description = normalizeDescription(input.description);
  const storage = await deps.areaMediaStorage.save({
    mediaId,
    uploadedByUserId: input.actorUserId,
    mimeType: prepared.mimeType,
    bytes: storedBytes,
  });

  await deps.areaMediaRepository.create({
    id: mediaId,
    areaId: area.id,
    uploadedByUserId: input.actorUserId,
    mediaType: input.mediaType,
    description,
    mimeType: prepared.mimeType,
    originalFileName: input.fileName,
    storagePath: storage.storagePath,
    fileSizeBytes: storedBytes.length,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });

  await deps.auditLog.log({
    actorUserId: input.actorUserId,
    action: "area.media.uploaded",
    entityType: "area_media",
    entityId: mediaId,
    metadata: {
      area_id: area.id,
      media_type: input.mediaType,
      mime_type: prepared.mimeType,
      declared_mime_type: input.mimeType,
      file_size_bytes: storedBytes.length,
      has_description: Boolean(description),
    },
  });

  return {
    id: mediaId,
    areaId: area.id,
    mediaType: input.mediaType,
    description,
    mimeType: prepared.mimeType,
    fileName: input.fileName,
    fileSizeBytes: storedBytes.length,
    createdAt: now,
  };
}

function validateMimeType(mediaType: AreaMediaType, mimeType: string): void {
  if (mediaType === "photo" && !photoMimeTypes.has(mimeType)) {
    throw new ValidationError([
      {
        field: "mime_type",
        message: "unsupported_mime_type",
      },
    ]);
  }

  if (mediaType === "video" && !videoMimeTypes.has(mimeType)) {
    throw new ValidationError([
      {
        field: "mime_type",
        message: "unsupported_mime_type",
      },
    ]);
  }
}

async function prepareUpload(
  mediaType: AreaMediaType,
  declaredMimeType: string,
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (mediaType === "photo") {
    const detectedMimeType = detectPhotoMimeType(bytes);
    if (detectedMimeType !== declaredMimeType) {
      throw new ValidationError([
        {
          field: "mime_type",
          message: "mime_type_mismatch",
        },
      ]);
    }

    try {
      const normalized = await sharp(Buffer.from(bytes))
        .rotate()
        .webp({ quality: 85 })
        .toBuffer();
      return {
        bytes: new Uint8Array(normalized),
        mimeType: storedPhotoMimeType,
      };
    } catch {
      throw new ValidationError([
        {
          field: "file_base64",
          message: "invalid_image",
        },
      ]);
    }
  }

  const detectedMimeType = detectVideoMimeType(bytes);
  if (detectedMimeType !== declaredMimeType) {
    throw new ValidationError([
      {
        field: "mime_type",
        message: "mime_type_mismatch",
      },
    ]);
  }

  return { bytes, mimeType: declaredMimeType };
}

function detectPhotoMimeType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

function detectVideoMimeType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }

  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    return ascii(bytes, 8, 12) === "qt  " ? "video/quicktime" : "video/mp4";
  }

  return null;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function normalizeDescription(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}
