import type { EmissionFactorRepository } from "../../domain/footprint/repositories/emission-factor-repository";
import type { FootprintCategory } from "../../domain/footprint/value-objects/category";

export interface GetEmissionFactorsRequest {
  version?: string;
  region?: string;
  category?: string;
}

export interface GetEmissionFactorsResponse {
  factors: Array<{
    id: string;
    activity_type: string;
    unit: string;
    factor_value: number;
    factor_unit: string;
    source: string;
    region: string;
    version: string;
  }>;
}

export interface GetEmissionFactorsDeps {
  emissionFactorRepository: EmissionFactorRepository;
}

export async function getEmissionFactors(
  deps: GetEmissionFactorsDeps,
  request: GetEmissionFactorsRequest,
): Promise<GetEmissionFactorsResponse> {
  const region = request.region || "BR";
  let version = request.version;

  if (!version) {
    version =
      (await deps.emissionFactorRepository.getLatestVersion(region)) ||
      "2026-01";
  }

  let factors;

  if (request.category) {
    factors = await deps.emissionFactorRepository.findByCategory(
      request.category as FootprintCategory,
      version,
      region,
    );
  } else {
    factors = await deps.emissionFactorRepository.findByVersionAndRegion(
      version,
      region,
    );
  }

  return {
    factors: factors.map((f) => ({
      id: f.id,
      activity_type: f.activity_type,
      unit: f.unit,
      factor_value: f.factor_value,
      factor_unit: f.factor_unit,
      source: f.source,
      region: f.region,
      version: f.version,
    })),
  };
}
