export class AuditStatus {
    value;
    constructor(value) {
        this.value = value;
    }
    static PENDING = new AuditStatus('pending');
    static APPROVED = new AuditStatus('approved');
    static REJECTED = new AuditStatus('rejected');
    static fromString(value) {
        const normalized = value.toLowerCase();
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
    isPending() {
        return this.value === 'pending';
    }
    isApproved() {
        return this.value === 'approved';
    }
    isRejected() {
        return this.value === 'rejected';
    }
    equals(other) {
        return this.value === other.value;
    }
    toString() {
        return this.value;
    }
}
