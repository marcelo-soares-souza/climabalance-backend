/**
 * Area Status Value Object
 * Represents the lifecycle status of an area/project
 *
 * Workflow: draft → pending_audit → approved → active
 *           (or rejected/suspended at any point)
 */
export type AreaStatusValue =
  | "draft"
  | "pending_audit"
  | "approved"
  | "active"
  | "rejected"
  | "suspended";

export class AreaStatus {
  private constructor(readonly value: AreaStatusValue) {}

  static DRAFT = new AreaStatus("draft");
  static PENDING_AUDIT = new AreaStatus("pending_audit");
  static APPROVED = new AreaStatus("approved");
  static ACTIVE = new AreaStatus("active");
  static REJECTED = new AreaStatus("rejected");
  static SUSPENDED = new AreaStatus("suspended");

  static fromString(value: string): AreaStatus {
    const normalized = value.toLowerCase() as AreaStatusValue;

    switch (normalized) {
      case "draft":
        return AreaStatus.DRAFT;
      case "pending_audit":
        return AreaStatus.PENDING_AUDIT;
      case "approved":
        return AreaStatus.APPROVED;
      case "active":
        return AreaStatus.ACTIVE;
      case "rejected":
        return AreaStatus.REJECTED;
      case "suspended":
        return AreaStatus.SUSPENDED;
      default:
        throw new Error(`Invalid area status: ${value}`);
    }
  }

  canTransitionTo(newStatus: AreaStatus): boolean {
    const transitions: Record<AreaStatusValue, AreaStatusValue[]> = {
      draft: ["pending_audit"],
      pending_audit: ["approved", "rejected"],
      approved: ["active", "rejected"],
      active: ["suspended"],
      rejected: [], // Terminal state
      suspended: ["active"], // Can be reactivated
    };

    return transitions[this.value].includes(newStatus.value);
  }

  isDraft(): boolean {
    return this.value === "draft";
  }

  isPendingAudit(): boolean {
    return this.value === "pending_audit";
  }

  isApproved(): boolean {
    return this.value === "approved";
  }

  isActive(): boolean {
    return this.value === "active";
  }

  isRejected(): boolean {
    return this.value === "rejected";
  }

  isSuspended(): boolean {
    return this.value === "suspended";
  }

  canBeEdited(): boolean {
    return this.value === "draft" || this.value === "active";
  }

  canBeEditedFor(isAdmin: boolean): boolean {
    if (isAdmin) {
      return true;
    }
    return this.canBeEdited();
  }

  canBeDeleted(): boolean {
    return this.value === "draft";
  }

  canBeDeletedFor(isAdmin: boolean): boolean {
    if (isAdmin) {
      return true;
    }
    return this.canBeDeleted();
  }

  canBeSubmittedForAudit(): boolean {
    return this.value === "draft";
  }

  equals(other: AreaStatus): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
