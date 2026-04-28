import { TreePlanting } from '../entities/tree-planting';

export type CreateTreePlantingRecord = {
  id: string;
  areaId: string;
  plantedByUserId: string;
  latitude: number;
  longitude: number;
  createdAt: Date;
  updatedAt: Date;
};

export interface TreePlantingRepository {
  findByAreaId(areaId: string, client?: any): Promise<TreePlanting[]>;
  countByAreaId(areaId: string, client?: any): Promise<number>;
  sumCompensatedTreeCountByAreaId(areaId: string, client?: any): Promise<number>;
  saveBatch(records: CreateTreePlantingRecord[], client?: any): Promise<void>;
  deleteByAreaId(areaId: string, client?: any): Promise<void>;
}
