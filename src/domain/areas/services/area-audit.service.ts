import { AreaCriterion } from "../entities/area-criterion";
import { AreaRepository } from "../repositories/area-repository";
import { AreaCriteriaRepository } from "../repositories/area-criteria-repository";

export interface AuditLogPort {
  log(entry: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, any>;
  }): Promise<void>;
}

export interface ClockPort {
  now(): Date;
}

export interface AreaAuditServiceDeps {
  areaRepository: AreaRepository;
  criteriaRepository: AreaCriteriaRepository;
  auditLog: AuditLogPort;
  clock: ClockPort;
}

/**
 * Area Audit Domain Service
 * Handles the audit workflow for areas
 */
export class AreaAuditService {
  constructor(private deps: AreaAuditServiceDeps) {}

  /**
   * Submit area for audit
   */
  async submitForAudit(
    areaId: string,
    userId: string,
    client?: any,
  ): Promise<void> {
    const area = await this.deps.areaRepository.findById(areaId, client);

    if (!area) {
      throw new Error("Area not found");
    }

    if (area.ownerUserId !== userId) {
      throw new Error("User is not the owner of this area");
    }

    // Use domain entity business rule
    area.submitForAudit();

    await this.deps.areaRepository.update(area, client);

    await this.deps.auditLog.log({
      actorUserId: userId,
      action: "area.submitted_for_audit",
      entityType: "area",
      entityId: areaId,
    });
  }

  /**
   * Approve area (analyst only)
   */
  async approveArea(
    areaId: string,
    analystId: string,
    criteria: Array<{
      criterionKey: string;
      criterionLabel: string;
      met: boolean;
      notes?: string;
    }>,
    notes?: string,
    client?: any,
  ): Promise<void> {
    const area = await this.deps.areaRepository.findById(areaId, client);

    if (!area) {
      throw new Error("Area not found");
    }

    // Verify all criteria are met
    const allMet = criteria.every((c) => c.met === true);
    if (!allMet) {
      throw new Error("Cannot approve area: not all criteria are met");
    }

    // Use domain entity business rule
    area.approve(analystId, notes);

    await this.deps.areaRepository.update(area, client);

    // Save criteria
    const criteriaEntities = criteria.map(
      (c) =>
        new AreaCriterion({
          id: crypto.randomUUID(), // Will be replaced by ID generator in application layer
          areaId: areaId,
          criterionKey: c.criterionKey,
          criterionLabel: c.criterionLabel,
          met: c.met,
          notes: c.notes,
          createdAt: this.deps.clock.now(),
          updatedAt: this.deps.clock.now(),
        }),
    );

    await this.deps.criteriaRepository.saveMany(criteriaEntities, client);

    await this.deps.auditLog.log({
      actorUserId: analystId,
      action: "area.approved",
      entityType: "area",
      entityId: areaId,
      metadata: { criteriaCount: criteria.length },
    });
  }

  /**
   * Reject area (analyst only)
   */
  async rejectArea(
    areaId: string,
    analystId: string,
    reason: string,
    client?: any,
  ): Promise<void> {
    const area = await this.deps.areaRepository.findById(areaId, client);

    if (!area) {
      throw new Error("Area not found");
    }

    if (!reason || reason.length < 10) {
      throw new Error("Rejection reason must be at least 10 characters");
    }

    // Use domain entity business rule
    area.reject(analystId, reason);

    await this.deps.areaRepository.update(area, client);

    await this.deps.auditLog.log({
      actorUserId: analystId,
      action: "area.rejected",
      entityType: "area",
      entityId: areaId,
      metadata: { reason },
    });
  }

  /**
   * Activate area for compensation (admin/analyst)
   */
  async activateArea(
    areaId: string,
    userId: string,
    client?: any,
  ): Promise<void> {
    const area = await this.deps.areaRepository.findById(areaId, client);

    if (!area) {
      throw new Error("Area not found");
    }

    // Use domain entity business rule
    area.activate();

    await this.deps.areaRepository.update(area, client);

    await this.deps.auditLog.log({
      actorUserId: userId,
      action: "area.activated",
      entityType: "area",
      entityId: areaId,
    });
  }

  /**
   * Suspend area (admin only)
   */
  async suspendArea(
    areaId: string,
    userId: string,
    client?: any,
  ): Promise<void> {
    const area = await this.deps.areaRepository.findById(areaId, client);

    if (!area) {
      throw new Error("Area not found");
    }

    // Use domain entity business rule
    area.suspend();

    await this.deps.areaRepository.update(area, client);

    await this.deps.auditLog.log({
      actorUserId: userId,
      action: "area.suspended",
      entityType: "area",
      entityId: areaId,
    });
  }
}
