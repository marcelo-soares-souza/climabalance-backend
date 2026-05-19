import type { AreaSatelliteImageRepository } from "../../domain/areas/repositories/area-satellite-image-repository";
import { NotFoundError } from "../../domain/errors";

export interface LatestSatelliteImageResult {
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

export async function getLatestSatelliteImage(
  deps: { satelliteImageRepository: AreaSatelliteImageRepository },
  areaId: string,
): Promise<LatestSatelliteImageResult> {
  const image = await deps.satelliteImageRepository.findLatestByAreaId(areaId);
  if (!image) {
    throw new NotFoundError("satellite.no_image");
  }

  return {
    id: image.id,
    captureDate: image.captureDate.toISOString().slice(0, 10),
    cloudCover: image.cloudCover,
    sceneId: image.sceneId,
    collection: image.collection,
    isFallback: image.isFallback,
    bboxWest: image.bboxWest,
    bboxSouth: image.bboxSouth,
    bboxEast: image.bboxEast,
    bboxNorth: image.bboxNorth,
    imageUrl: `/api/v1/satellite-images/${image.id}/file`,
    thumbnailUrl: `/api/v1/satellite-images/${image.id}/thumbnail`,
    createdAt: image.createdAt,
  };
}
