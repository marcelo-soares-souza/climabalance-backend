export type AreaMediaType = 'photo' | 'video';

export type AreaMedia = {
  id: string;
  areaId: string;
  uploadedByUserId: string;
  mediaType: AreaMediaType;
  description?: string | null;
  mimeType: string;
  originalFileName: string;
  storagePath: string;
  fileSizeBytes: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export interface AreaMediaRepository {
  create(media: AreaMedia, client?: any): Promise<void>;
  findById(id: string, client?: any): Promise<AreaMedia | null>;
  listByAreaId(areaId: string, client?: any): Promise<AreaMedia[]>;
  listByAreaIds(areaIds: string[], client?: any): Promise<AreaMedia[]>;
  softDelete(id: string, deletedAt: Date, client?: any): Promise<void>;
}
