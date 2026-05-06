export interface AreaSatelliteImageProps {
  id: string;
  areaId: string;
  requestedByUserId: string;
  sceneId: string;
  collection: string;
  captureDate: Date;
  cloudCover: number | null;
  bboxWest: number;
  bboxSouth: number;
  bboxEast: number;
  bboxNorth: number;
  storagePath: string;
  thumbnailPath: string | null;
  fileSizeBytes: number | null;
  isFallback: boolean;
  createdAt: Date;
  deletedAt: Date | null;
}

export class AreaSatelliteImage {
  readonly id: string;
  readonly areaId: string;
  readonly requestedByUserId: string;
  readonly sceneId: string;
  readonly collection: string;
  readonly captureDate: Date;
  readonly cloudCover: number | null;
  readonly bboxWest: number;
  readonly bboxSouth: number;
  readonly bboxEast: number;
  readonly bboxNorth: number;
  storagePath: string;
  thumbnailPath: string | null;
  fileSizeBytes: number | null;
  readonly isFallback: boolean;
  readonly createdAt: Date;
  deletedAt: Date | null;

  constructor(props: AreaSatelliteImageProps) {
    this.id = props.id;
    this.areaId = props.areaId;
    this.requestedByUserId = props.requestedByUserId;
    this.sceneId = props.sceneId;
    this.collection = props.collection;
    this.captureDate = props.captureDate;
    this.cloudCover = props.cloudCover;
    this.bboxWest = props.bboxWest;
    this.bboxSouth = props.bboxSouth;
    this.bboxEast = props.bboxEast;
    this.bboxNorth = props.bboxNorth;
    this.storagePath = props.storagePath;
    this.thumbnailPath = props.thumbnailPath;
    this.fileSizeBytes = props.fileSizeBytes;
    this.isFallback = props.isFallback;
    this.createdAt = props.createdAt;
    this.deletedAt = props.deletedAt;
  }

  isActive(): boolean {
    return !this.deletedAt;
  }

  setThumbnail(path: string): void {
    this.thumbnailPath = path;
  }

  setStoragePath(path: string, sizeBytes: number): void {
    this.storagePath = path;
    this.fileSizeBytes = sizeBytes;
  }

  softDelete(at: Date): void {
    this.deletedAt = at;
  }
}
