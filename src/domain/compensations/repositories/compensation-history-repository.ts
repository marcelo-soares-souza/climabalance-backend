/**
 * Read model for compensation history listing APIs.
 */
export type CompensationHistoryItem = {
  id: string;
  supporterUserId: string;
  areaId: string;
  areaName?: string | null;
  calculationId?: string | null;
  compensationMode?: 'tco2e' | 'tree_purchase';
  horizonYears?: number | null;
  treesRequested?: number | null;
  pricePerTree?: number | null;
  estimatedTotalTCO2e?: number | null;
  totalTCO2e: number;
  treesCount?: number | null;
  totalAmount: number;
  currency: string;
  status: 'pending' | 'paid' | 'canceled' | 'refunded';
  createdAt: Date;
};

/**
 * Repository port for compensation history projections.
 */
export interface CompensationHistoryRepository {
  listBySupporter(
    input: {
      supporterUserId: string;
      status?: CompensationHistoryItem['status'];
      limit: number;
      offset: number;
    },
    client?: any
  ): Promise<CompensationHistoryItem[]>;
}
