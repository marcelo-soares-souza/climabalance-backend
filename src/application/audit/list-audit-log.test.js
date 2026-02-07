import { describe, expect, it } from 'bun:test';
import { listAuditLog } from './list-audit-log';
class SpyAuditLogRepository {
    entries;
    constructor(entries) {
        this.entries = entries;
    }
    lastFilters = null;
    async create(_entry) {
        // no-op for list tests
    }
    async list(filters) {
        this.lastFilters = filters;
        return this.entries;
    }
}
describe('listAuditLog', () => {
    it('returns entries from repository and passes filters', async () => {
        const entries = [
            {
                id: 'audit-1',
                actorUserId: 'user-1',
                action: 'user.update',
                entityType: 'user',
                entityId: 'user-1',
                reason: 'profile_update',
                createdAt: new Date('2024-01-01T10:00:00Z')
            }
        ];
        const repo = new SpyAuditLogRepository(entries);
        const result = await listAuditLog({ actorUserId: 'user-1', entityType: 'user', limit: 10, offset: 0 }, { auditLog: repo });
        expect(result).toEqual(entries);
        expect(repo.lastFilters).toEqual({ actorUserId: 'user-1', entityType: 'user', limit: 10, offset: 0 });
    });
});
