export class TreePlanting {
  constructor(
    readonly id: string,
    readonly areaId: string,
    readonly plantedByUserId: string,
    readonly latitude: number,
    readonly longitude: number,
    readonly createdAt: Date,
    readonly updatedAt: Date,
    readonly deletedAt: Date | null,
  ) {}
}
