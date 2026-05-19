import { describe, expect, it } from "bun:test";
import type {
  AuditLogEntry,
  AuditLogFilters,
  AuditLogRepository,
} from "../../domain/audit/audit-log-repository";
import { listAuditLog } from "./list-audit-log";

class SpyAuditLogRepository implements AuditLogRepository {
  constructor(private entries: AuditLogEntry[]) {}

  lastFilters: AuditLogFilters | null = null;

  async create(_entry: AuditLogEntry): Promise<void> {
    // no-op for list tests
  }

  async list(filters: AuditLogFilters): Promise<AuditLogEntry[]> {
    this.lastFilters = filters;
    return this.entries;
  }

  async log(): Promise<void> {
    // no-op for list tests
  }

  async verifyChain(): Promise<{
    valid: boolean;
    totalEntries: number;
    verifiedEntries: number;
    firstBrokenEntry?: string;
  }> {
    return { valid: true, totalEntries: 0, verifiedEntries: 0 };
  }

  async archive(): Promise<{ archived: number; deleted: number }> {
    return { archived: 0, deleted: 0 };
  }

  async listWithTotal(): Promise<{ entries: AuditLogEntry[]; total: number }> {
    return { entries: this.entries, total: this.entries.length };
  }
}

describe("listAuditLog", () => {
  it("returns entries from repository and passes filters", async () => {
    const entries: AuditLogEntry[] = [
      {
        id: "audit-1",
        actorUserId: "user-1",
        action: "user.update",
        entityType: "user",
        entityId: "user-1",
        reason: "profile_update",
        createdAt: new Date("2024-01-01T10:00:00Z"),
      },
    ];
    const repo = new SpyAuditLogRepository(entries);

    const result = await listAuditLog(
      {
        actorUserId: "user-1",
        actorEmail: "john@test.com",
        action: "update",
        clientIp: "192.168.",
        entityType: "user",
        severity: "warning",
        isSensitive: true,
        limit: 10,
        offset: 0,
      },
      { auditLog: repo },
    );

    expect(result).toEqual(entries);
    expect(repo.lastFilters).toEqual({
      actorUserId: "user-1",
      actorEmail: "john@test.com",
      action: "update",
      clientIp: "192.168.",
      entityType: "user",
      severity: "warning",
      isSensitive: true,
      limit: 10,
      offset: 0,
    });
  });
});
