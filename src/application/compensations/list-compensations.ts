import type {
  CompensationHistoryItem,
  CompensationHistoryRepository,
} from "../../domain/compensations/repositories/compensation-history-repository";
import { ForbiddenError } from "../../domain/errors";

export type ListCompensationsInput = {
  supporterUserId: string;
  actorUserId?: string;
  actorRoles?: string[];
  status?: CompensationHistoryItem["status"];
  limit?: number;
  offset?: number;
};

export async function listCompensations(
  deps: {
    historyRepository: CompensationHistoryRepository;
  },
  input: ListCompensationsInput,
): Promise<CompensationHistoryItem[]> {
  if (input.actorUserId && input.actorRoles) {
    const isAdmin = input.actorRoles.includes("administrator");
    const isSelf = input.actorUserId === input.supporterUserId;
    if (!isAdmin && !isSelf) {
      throw new ForbiddenError("auth.forbidden");
    }
  }

  const limit = normalizeLimit(input.limit);
  const offset = normalizeOffset(input.offset);

  return deps.historyRepository.listBySupporter({
    supporterUserId: input.supporterUserId,
    status: input.status,
    limit,
    offset,
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
