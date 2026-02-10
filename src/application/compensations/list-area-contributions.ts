import type {
  AreaContributionItem,
  CompensationHistoryRepository,
} from '../../domain/compensations/repositories/compensation-history-repository';

export type ListAreaContributionsInput = {
  areaId: string;
  limit?: number;
  offset?: number;
};

export async function listAreaContributions(
  deps: {
    historyRepository: CompensationHistoryRepository;
  },
  input: ListAreaContributionsInput
): Promise<AreaContributionItem[]> {
  return deps.historyRepository.listPaidTreePurchaseByArea({
    areaId: input.areaId,
    limit: normalizeLimit(input.limit),
    offset: normalizeOffset(input.offset),
  });
}

function normalizeLimit(value?: number): number {
  if (value == null || Number.isNaN(value)) return 20;
  const parsed = Math.trunc(value);
  if (parsed <= 0) return 20;
  return Math.min(parsed, 100);
}

function normalizeOffset(value?: number): number {
  if (value == null || Number.isNaN(value)) return 0;
  const parsed = Math.trunc(value);
  if (parsed < 0) return 0;
  return parsed;
}
