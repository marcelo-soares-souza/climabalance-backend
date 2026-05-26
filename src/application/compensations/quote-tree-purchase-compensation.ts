import type { AreaRepository } from "../../domain/areas/repositories/area-repository";
import type { CompensationHistoryRepository } from "../../domain/compensations/repositories/compensation-history-repository";
import type { UserRepository } from "../../domain/user/user-repository";
import { NotFoundError, ValidationError } from "../../domain/errors";
import { resolveUserCurrency } from "./resolve-user-country";
import { convertUsdToBrl } from "./convert-currency";

export const TREE_PURCHASE_HORIZON_YEARS = 20;
const DEFAULT_T_CO2E_PER_TREE_PER_YEAR = 0.00075;

// Base pricing is always defined in USD.
const DEFAULT_USD_PRICE = 15.0;

export type QuoteTreePurchaseCompensationInput = {
  areaId: string;
  treesRequested: number;
  currency: string;
  userId?: string;
};

export type QuoteTreePurchaseCompensationResult = {
  areaId: string;
  compensationMode: "tree_purchase";
  horizonYears: number;
  treesRequested: number;
  estimatedKgCO2PerTreePerYear: number;
  estimatedTotalTCO2e: number;
  estimatedTotalKgCO2e: number;
  pricePerTree: number;
  totalAmount: number;
  currency: string;
  maxPurchasableTrees: number | null;
  remainingPurchasableTrees: number;
};

export async function quoteTreePurchaseCompensation(
  deps: {
    areaRepository: AreaRepository;
    compensationHistoryRepository: CompensationHistoryRepository;
    userRepository: UserRepository;
    usdToBrlExchangeRate: number;
    defaultMaxPurchasableTrees: number;
  },
  input: QuoteTreePurchaseCompensationInput,
): Promise<QuoteTreePurchaseCompensationResult> {
  validateInput(input);

  const area = await deps.areaRepository.findById(input.areaId);
  if (!area) {
    throw new NotFoundError("area.not_found");
  }

  if (!area.isActive()) {
    throw new ValidationError([
      {
        field: "area_id",
        message: "area_not_active",
      },
    ]);
  }

  const effectiveMax = area.getEffectiveMaxPurchasableTrees(
    deps.defaultMaxPurchasableTrees,
  );
  const paidTreeCount =
    await deps.compensationHistoryRepository.sumPaidTreeCountByArea(area.id);
  const remainingPurchasableTrees = Math.max(0, effectiveMax - paidTreeCount);

  const tCO2ePerTreePerYear =
    area.tCO2ePerTreePerYear ?? DEFAULT_T_CO2E_PER_TREE_PER_YEAR;
  const estimatedKgCO2PerTreePerYear = tCO2ePerTreePerYear * 1000;
  const horizonYears = area.defaultHorizonYears ?? TREE_PURCHASE_HORIZON_YEARS;
  const estimatedTotalTCO2e =
    input.treesRequested * tCO2ePerTreePerYear * horizonYears;
  const estimatedTotalKgCO2e = estimatedTotalTCO2e * 1000;

  const effectiveCurrency = input.userId
    ? await resolveUserCurrency(deps.userRepository, input.userId)
    : "USD";

  const basePriceUsd =
    area.pricePerTree != null && area.pricePerTree > 0
      ? area.pricePerTree
      : DEFAULT_USD_PRICE;

  if (!basePriceUsd || basePriceUsd <= 0) {
    throw new ValidationError([
      {
        field: "price_per_tree",
        message: "invalid_price",
      },
    ]);
  }

  const pricePerTree =
    effectiveCurrency === "BRL"
      ? convertUsdToBrl(basePriceUsd, deps.usdToBrlExchangeRate)
      : basePriceUsd;

  const totalAmount = input.treesRequested * pricePerTree;

  return {
    areaId: area.id,
    compensationMode: "tree_purchase",
    horizonYears,
    treesRequested: input.treesRequested,
    estimatedKgCO2PerTreePerYear,
    estimatedTotalTCO2e,
    estimatedTotalKgCO2e,
    pricePerTree,
    totalAmount,
    currency: effectiveCurrency,
    maxPurchasableTrees: area.maxPurchasableTrees,
    remainingPurchasableTrees,
  };
}

function validateInput(input: QuoteTreePurchaseCompensationInput): void {
  const errors: Array<{ field: string; message: string }> = [];
  if (!input.areaId || !input.areaId.trim()) {
    errors.push({ field: "area_id", message: "required" });
  }
  if (!Number.isFinite(input.treesRequested) || input.treesRequested <= 0) {
    errors.push({ field: "trees_requested", message: "must_be_positive" });
  }
  if (!input.currency || input.currency.trim().length !== 3) {
    errors.push({ field: "currency", message: "must_be_iso_4217" });
  }
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}
