import { AreaCriterion } from '../entities/area-criterion';
/**
 * Area Audit Domain Service
 * Handles the audit workflow for areas
 */
export class AreaAuditService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    /**
     * Submit area for audit
     */
    async submitForAudit(areaId, userId, client) {
        const area = await this.deps.areaRepository.findById(areaId, client);
        if (!area) {
            throw new Error('Area not found');
        }
        if (area.ownerUserId !== userId) {
            throw new Error('User is not the owner of this area');
        }
        // Use domain entity business rule
        area.submitForAudit();
        await this.deps.areaRepository.update(area, client);
        await this.deps.auditLog.log({
            actorUserId: userId,
            action: 'area.submitted_for_audit',
            entityType: 'area',
            entityId: areaId,
        });
    }
    /**
     * Approve area (analyst only)
     */
    async approveArea(areaId, analystId, criteria, notes, client) {
        const area = await this.deps.areaRepository.findById(areaId, client);
        if (!area) {
            throw new Error('Area not found');
        }
        // Verify all criteria are met
        const allMet = criteria.every((c) => c.met === true);
        if (!allMet) {
            throw new Error('Cannot approve area: not all criteria are met');
        }
        // Use domain entity business rule
        area.approve(analystId, notes);
        await this.deps.areaRepository.update(area, client);
        // Save criteria
        const criteriaEntities = criteria.map((c) => new AreaCriterion({
            id: crypto.randomUUID(), // Will be replaced by ID generator in application layer
            areaId: areaId,
            criterionKey: c.criterionKey,
            criterionLabel: c.criterionLabel,
            met: c.met,
            notes: c.notes,
            createdAt: this.deps.clock.now(),
            updatedAt: this.deps.clock.now(),
        }));
        await this.deps.criteriaRepository.saveMany(criteriaEntities, client);
        await this.deps.auditLog.log({
            actorUserId: analystId,
            action: 'area.approved',
            entityType: 'area',
            entityId: areaId,
            metadata: { criteriaCount: criteria.length },
        });
    }
    /**
     * Reject area (analyst only)
     */
    async rejectArea(areaId, analystId, reason, client) {
        const area = await this.deps.areaRepository.findById(areaId, client);
        if (!area) {
            throw new Error('Area not found');
        }
        if (!reason || reason.length < 10) {
            throw new Error('Rejection reason must be at least 10 characters');
        }
        // Use domain entity business rule
        area.reject(analystId, reason);
        await this.deps.areaRepository.update(area, client);
        await this.deps.auditLog.log({
            actorUserId: analystId,
            action: 'area.rejected',
            entityType: 'area',
            entityId: areaId,
            metadata: { reason },
        });
    }
    /**
     * Activate area for compensation (admin/analyst)
     */
    async activateArea(areaId, userId, client) {
        const area = await this.deps.areaRepository.findById(areaId, client);
        if (!area) {
            throw new Error('Area not found');
        }
        // Use domain entity business rule
        area.activate();
        await this.deps.areaRepository.update(area, client);
        await this.deps.auditLog.log({
            actorUserId: userId,
            action: 'area.activated',
            entityType: 'area',
            entityId: areaId,
        });
    }
    /**
     * Suspend area (admin only)
     */
    async suspendArea(areaId, userId, client) {
        const area = await this.deps.areaRepository.findById(areaId, client);
        if (!area) {
            throw new Error('Area not found');
        }
        // Use domain entity business rule
        area.suspend();
        await this.deps.areaRepository.update(area, client);
        await this.deps.auditLog.log({
            actorUserId: userId,
            action: 'area.suspended',
            entityType: 'area',
            entityId: areaId,
        });
    }
}
