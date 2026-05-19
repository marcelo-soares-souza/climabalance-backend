/**
 * Read model for compensation history listing APIs.
 */
export type CompensationHistoryItem = {
  id: string;
  supporterUserId: string;
  areaId: string;
  areaName?: string | null;
  areaSlug?: string | null;
  calculationId?: string | null;
  compensationMode?: "tco2e" | "tree_purchase";
  horizonYears?: number | null;
  treesRequested?: number | null;
  pricePerTree?: number | null;
  estimatedTotalTCO2e?: number | null;
  totalTCO2e: number;
  treesCount?: number | null;
  totalAmount: number;
  currency: string;
  status: "pending" | "paid" | "canceled" | "refunded";
  createdAt: Date;
};

/**
 * Read model for area-level contributor listing.
 */
export type AreaContributionItem = {
  compensationId: string;
  supporterUserId: string;
  supporterSlug?: string | null;
  supporterDisplayName?: string | null;
  supporterEmail?: string | null;
  treesCount: number;
  totalTCO2e: number;
  compensatedAt: Date;
};

/**
 * Repository port for compensation history projections.
 */
export interface CompensationHistoryRepository {
  listBySupporter(
    input: {
      supporterUserId: string;
      status?: CompensationHistoryItem["status"];
      limit: number;
      offset: number;
    },
    client?: any,
  ): Promise<CompensationHistoryItem[]>;

  listPaidTreePurchaseByArea(
    input: {
      areaId: string;
      limit: number;
      offset: number;
    },
    client?: any,
  ): Promise<AreaContributionItem[]>;

  findById(
    compensationId: string,
    client?: any,
  ): Promise<CompensationHistoryItem | null>;

  sumPaidTreeCountByArea(areaId: string, client?: any): Promise<number>;
}
