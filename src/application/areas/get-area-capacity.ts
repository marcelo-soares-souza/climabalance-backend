import { CarbonStockService } from "../../domain/areas/services/carbon-stock.service";

export interface GetAreaCapacityResponse {
  availableTCO2e: number;
}

export interface GetAreaCapacityDeps {
  carbonStockService: CarbonStockService;
}

export async function getAreaCapacity(
  deps: GetAreaCapacityDeps,
  areaId: string,
): Promise<GetAreaCapacityResponse> {
  const available = await deps.carbonStockService.getAvailableCapacity(areaId);

  return {
    availableTCO2e: available,
  };
}
