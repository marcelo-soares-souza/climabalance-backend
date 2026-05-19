import { AreaSatelliteImage } from "../entities/area-satellite-image";

export interface AreaSatelliteImageRepository {
  create(image: AreaSatelliteImage): Promise<void>;
  findById(id: string): Promise<AreaSatelliteImage | null>;
  findLatestByAreaId(areaId: string): Promise<AreaSatelliteImage | null>;
  softDeletePreviousForArea(areaId: string, deletedAt: Date): Promise<void>;
  softDelete(id: string, deletedAt: Date): Promise<void>;
}
