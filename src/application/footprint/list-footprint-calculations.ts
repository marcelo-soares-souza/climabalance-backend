import type { FootprintCalculationRepository } from "../../domain/footprint/repositories/footprint-calculation-repository";
import type { CalculationStatus } from "../../domain/footprint/value-objects/calculation-status";
import type { ProfileType } from "../../domain/footprint/value-objects/profile-type";

export interface ListFootprintCalculationsRequest {
  user_id: string;
  status?: string;
  profile_type?: string;
  user_email?: string;
  limit?: number;
  offset?: number;
  is_admin?: boolean;
}

export interface ListFootprintCalculationsResponse {
  calculations: Array<{
    id: string;
    user_id: string;
    profile_type: string;
    period_start: string;
    period_end: string;
    total_t_co2e: number;
    total_kg_co2e: number;
    status: string;
    data_quality: string;
    factors_version: string;
    finalized_at: string | null;
    created_at: string;
    updated_at: string;
    user_email?: string | null;
    user_name?: string | null;
    inputs: Array<{
      id: string;
      category: string;
      activity_type: string;
      quantity: number;
      unit: string;
      kg_co2e: number;
      metadata: Record<string, unknown> | null;
    }>;
    breakdown: Array<{
      category: string;
      kg_co2e: number;
      t_co2e: number;
    }>;
  }>;
}

export interface ListFootprintCalculationsDeps {
  calculationRepository: FootprintCalculationRepository;
}

export async function listFootprintCalculations(
  deps: ListFootprintCalculationsDeps,
  request: ListFootprintCalculationsRequest,
): Promise<ListFootprintCalculationsResponse> {
  const filters: {
    status?: CalculationStatus;
    profile_type?: ProfileType;
    user_email?: string;
    limit?: number;
    offset?: number;
  } = {};

  if (request.status) {
    filters.status = request.status as CalculationStatus;
  }
  if (request.profile_type) {
    filters.profile_type = request.profile_type as ProfileType;
  }
  if (request.is_admin && request.user_email) {
    const trimmed = request.user_email.trim();
    if (trimmed.length > 0) {
      filters.user_email = trimmed;
    }
  }
  filters.limit = request.limit || 50;
  filters.offset = request.offset || 0;

  const calculations = request.is_admin
    ? await deps.calculationRepository.findAll(filters)
    : await deps.calculationRepository.findByUserId(request.user_id, filters);

  return {
    calculations: calculations.map((c) => ({
      id: c.id,
      user_id: c.user_id,
      profile_type: c.profile_type,
      period_start: c.period_start.toISOString().split("T")[0]!,
      period_end: c.period_end.toISOString().split("T")[0]!,
      total_t_co2e: c.total_t_co2e,
      total_kg_co2e: c.total_kg_co2e,
      status: c.status,
      data_quality: c.data_quality,
      factors_version: c.factors_version,
      finalized_at: c.finalized_at ? c.finalized_at.toISOString() : null,
      created_at: c.created_at.toISOString(),
      updated_at: c.updated_at.toISOString(),
      user_email: c.user_email ?? null,
      user_name: c.user_name ?? null,
      inputs: [],
      breakdown: [],
    })),
  };
}
