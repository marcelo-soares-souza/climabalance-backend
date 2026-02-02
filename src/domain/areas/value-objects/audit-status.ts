/**
 * Audit Status Value Object
 * Represents the audit-specific status of an area
 */
export type AuditStatusValue = 'pending' | 'approved' | 'rejected';

export class AuditStatus {
  private constructor(readonly value: AuditStatusValue) {}

  static PENDING = new AuditStatus('pending');
  static APPROVED = new AuditStatus('approved');
  static REJECTED = new AuditStatus('rejected');

  static fromString(value: string): AuditStatus {
    const normalized = value.toLowerCase() as AuditStatusValue;

    switch (normalized) {
      case 'pending':
        return AuditStatus.PENDING;
      case 'approved':
        return AuditStatus.APPROVED;
      case 'rejected':
        return AuditStatus.REJECTED;
      default:
        throw new Error(`Invalid audit status: ${value}`);
    }
  }

  isPending(): boolean {
    return this.value === 'pending';
  }

  isApproved(): boolean {
    return this.value === 'approved';
  }

  isRejected(): boolean {
    return this.value === 'rejected';
  }

  equals(other: AuditStatus): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
