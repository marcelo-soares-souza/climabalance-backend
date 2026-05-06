import type { AreaRepository } from '../../domain/areas/repositories/area-repository';
import type { AreaSatelliteImageRepository } from '../../domain/areas/repositories/area-satellite-image-repository';
import type { SatelliteImageStorage } from '../../domain/areas/services/satellite-image-storage';
import { ForbiddenError, NotFoundError } from '../../domain/errors';
import {
  searchStacScenes,
  searchLandsatFallback,
  pickBestScene,
  downloadRgbComposite,
  generateThumbnail,
} from '../../infrastructure/services/earth-search-client';

export interface FetchSatelliteImageInput {
  areaId: string;
  actorUserId: string;
  actorRoles: string[];
  bboxSizeKm: number;
  maxCloud: number;
  daysBack: number;
}

export interface FetchSatelliteImageResult {
  id: string;
  captureDate: string;
  cloudCover: number | null;
  sceneId: string;
  collection: string;
  isFallback: boolean;
  bboxWest: number;
  bboxSouth: number;
  bboxEast: number;
  bboxNorth: number;
  imageUrl: string;
  thumbnailUrl: string;
  createdAt: Date;
}

export async function fetchAreaSatelliteImage(
  deps: {
    areaRepository: AreaRepository;
    satelliteImageRepository: AreaSatelliteImageRepository;
    satelliteImageStorage: SatelliteImageStorage;
    idGenerator: { generate(): string };
    clock: { now(): Date };
  },
  input: FetchSatelliteImageInput,
): Promise<FetchSatelliteImageResult> {
  const area = await deps.areaRepository.findById(input.areaId);
  if (!area) {
    throw new NotFoundError('area.not_found');
  }

  const isProducerOrAdmin =
    input.actorRoles.includes('administrator') ||
    area.ownerUserId === input.actorUserId;
  if (!isProducerOrAdmin) {
    throw new ForbiddenError('area.not_owner');
  }

  const now = deps.clock.now();
  const endDate = new Date(now);
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - input.daysBack);

  const randomOffset = Math.floor(
    Math.random() * (endDate.getTime() - startDate.getTime()),
  );
  const targetDate = new Date(startDate.getTime() + randomOffset);

  const searchStart = new Date(targetDate);
  searchStart.setDate(searchStart.getDate() - 3);
  const searchEnd = new Date(targetDate);
  searchEnd.setDate(searchEnd.getDate() + 3);

  const delta = input.bboxSizeKm / 2 / 111.0;
  const bbox = {
    west: area.location.longitude - delta,
    south: area.location.latitude - delta,
    east: area.location.longitude + delta,
    north: area.location.latitude + delta,
  };

  const searchParams = {
    lat: area.location.latitude,
    lng: area.location.longitude,
    startDate: searchStart.toISOString().slice(0, 10),
    endDate: searchEnd.toISOString().slice(0, 10),
    maxCloud: input.maxCloud,
  };

  let scenes = await searchStacScenes(searchParams);
  let collection = 'sentinel-2-l2a';

  if (scenes.length === 0) {
    scenes = await searchLandsatFallback(searchParams);
    collection = 'landsat-c2l2';
  }

  const scene = pickBestScene(scenes);
  if (!scene) {
    throw new NotFoundError('satellite.no_scene_found');
  }

  const processed = await downloadRgbComposite(scene, bbox);
  const thumbBytes = await generateThumbnail(processed.bytes);

  const imageId = deps.idGenerator.generate();
  const createdAt = deps.clock.now();

  const storageResult = await deps.satelliteImageStorage.save(
    imageId,
    processed.bytes,
    processed.mimeType,
  );

  const thumbResult = await deps.satelliteImageStorage.saveThumbnail(
    imageId,
    thumbBytes,
  );

  const previous = await deps.satelliteImageRepository.findLatestByAreaId(
    input.areaId,
  );
  if (previous) {
    await deps.satelliteImageStorage.delete(previous.storagePath).catch(() => {});
    if (previous.thumbnailPath) {
      await deps.satelliteImageStorage.delete(previous.thumbnailPath).catch(() => {});
    }
    await deps.satelliteImageRepository.softDelete(previous.id, createdAt);
  }

  const captureDate = new Date(scene.datetime ?? searchEnd);

  const AreaSatelliteImage = (
    await import('../../domain/areas/entities/area-satellite-image')
  ).AreaSatelliteImage;

  const entity = new AreaSatelliteImage({
    id: imageId,
    areaId: input.areaId,
    requestedByUserId: input.actorUserId,
    sceneId: scene.id,
    collection,
    captureDate,
    cloudCover: scene.cloudCover,
    bboxWest: bbox.west,
    bboxSouth: bbox.south,
    bboxEast: bbox.east,
    bboxNorth: bbox.north,
    storagePath: storageResult.storagePath,
    thumbnailPath: thumbResult.thumbnailPath,
    fileSizeBytes: processed.bytes.length,
    isFallback: processed.isFallback,
    createdAt,
    deletedAt: null,
  });

  await deps.satelliteImageRepository.create(entity);

  return {
    id: imageId,
    captureDate: captureDate.toISOString().slice(0, 10),
    cloudCover: scene.cloudCover,
    sceneId: scene.id,
    collection,
    isFallback: processed.isFallback,
    bboxWest: bbox.west,
    bboxSouth: bbox.south,
    bboxEast: bbox.east,
    bboxNorth: bbox.north,
    imageUrl: `/api/v1/satellite-images/${imageId}/file`,
    thumbnailUrl: `/api/v1/satellite-images/${imageId}/thumbnail`,
    createdAt,
  };
}
