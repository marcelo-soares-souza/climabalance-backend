import type { AreaRepository } from '../../domain/areas/repositories/area-repository';
import { NotFoundError, ValidationError } from '../../domain/errors';

export const TREE_PURCHASE_HORIZON_YEARS = 20;
const DEFAULT_T_CO2E_PER_TREE_PER_YEAR = 0.00075;

const DEFAULT_PRICE_BY_CURRENCY: Record<string, number> = {
  BRL: 12.0,
  USD: 2.5,
  EUR: 2.3,
};

export type QuoteTreePurchaseCompensationInput = {
  areaId: string;
  treesRequested: number;
  currency: string;
};

export type QuoteTreePurchaseCompensationResult = {
  areaId: string;
  compensationMode: 'tree_purchase';
  horizonYears: number;
  treesRequested: number;
  estimatedKgCO2PerTreePerYear: number;
  estimatedTotalTCO2e: number;
  estimatedTotalKgCO2e: number;
  pricePerTree: number;
  totalAmount: number;
  currency: string;
};

export async function quoteTreePurchaseCompensation(
  deps: {
    areaRepository: AreaRepository;
    treePriceResolver?: (currency: string, areaId: string) => number | null;
  },
  input: QuoteTreePurchaseCompensationInput
): Promise<QuoteTreePurchaseCompensationResult> {
  validateInput(input);

  const area = await deps.areaRepository.findById(input.areaId);
  if (!area) {
    throw new NotFoundError('area.not_found');
  }

  if (!area.isActive()) {
    throw new ValidationError([
      {
        field: 'area_id',
        message: 'area_not_active',
      },
    ]);
  }

  const tCO2ePerTreePerYear =
    area.tCO2ePerTreePerYear ?? DEFAULT_T_CO2E_PER_TREE_PER_YEAR;
  const estimatedKgCO2PerTreePerYear = tCO2ePerTreePerYear * 1000;
  const horizonYears = area.defaultHorizonYears ?? TREE_PURCHASE_HORIZON_YEARS;
  const estimatedTotalTCO2e =
    input.treesRequested * tCO2ePerTreePerYear * horizonYears;
  const estimatedTotalKgCO2e = estimatedTotalTCO2e * 1000;
  const currency = input.currency.trim().toUpperCase();

  const resolvedPrice =
    (area.pricePerTree != null && area.pricePerTree > 0
      ? area.pricePerTree
      : null) ??
    deps.treePriceResolver?.(currency, area.id) ??
    DEFAULT_PRICE_BY_CURRENCY[currency] ??
    null;

  if (!resolvedPrice || resolvedPrice <= 0) {
    throw new ValidationError([
      {
        field: 'currency',
        message: 'unsupported_currency',
      },
    ]);
  }

  return {
    areaId: area.id,
    compensationMode: 'tree_purchase',
    horizonYears,
    treesRequested: input.treesRequested,
    estimatedKgCO2PerTreePerYear,
    estimatedTotalTCO2e,
    estimatedTotalKgCO2e,
    pricePerTree: resolvedPrice,
    totalAmount: input.treesRequested * resolvedPrice,
    currency,
  };
}

function validateInput(input: QuoteTreePurchaseCompensationInput): void {
  const errors: Array<{ field: string; message: string }> = [];
  if (!input.areaId || !input.areaId.trim()) {
    errors.push({ field: 'area_id', message: 'required' });
  }
  if (!Number.isFinite(input.treesRequested) || input.treesRequested <= 0) {
    errors.push({ field: 'trees_requested', message: 'must_be_positive' });
  }
  if (!input.currency || input.currency.trim().length !== 3) {
    errors.push({ field: 'currency', message: 'must_be_iso_4217' });
  }
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}
