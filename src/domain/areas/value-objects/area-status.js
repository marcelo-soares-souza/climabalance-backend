export class AreaStatus {
    value;
    constructor(value) {
        this.value = value;
    }
    static DRAFT = new AreaStatus('draft');
    static PENDING_AUDIT = new AreaStatus('pending_audit');
    static APPROVED = new AreaStatus('approved');
    static ACTIVE = new AreaStatus('active');
    static REJECTED = new AreaStatus('rejected');
    static SUSPENDED = new AreaStatus('suspended');
    static fromString(value) {
        const normalized = value.toLowerCase();
        switch (normalized) {
            case 'draft':
                return AreaStatus.DRAFT;
            case 'pending_audit':
                return AreaStatus.PENDING_AUDIT;
            case 'approved':
                return AreaStatus.APPROVED;
            case 'active':
                return AreaStatus.ACTIVE;
            case 'rejected':
                return AreaStatus.REJECTED;
            case 'suspended':
                return AreaStatus.SUSPENDED;
            default:
                throw new Error(`Invalid area status: ${value}`);
        }
    }
    canTransitionTo(newStatus) {
        const transitions = {
            draft: ['pending_audit'],
            pending_audit: ['approved', 'rejected'],
            approved: ['active', 'rejected'],
            active: ['suspended'],
            rejected: [], // Terminal state
            suspended: ['active'], // Can be reactivated
        };
        return transitions[this.value].includes(newStatus.value);
    }
    isDraft() {
        return this.value === 'draft';
    }
    isPendingAudit() {
        return this.value === 'pending_audit';
    }
    isApproved() {
        return this.value === 'approved';
    }
    isActive() {
        return this.value === 'active';
    }
    isRejected() {
        return this.value === 'rejected';
    }
    isSuspended() {
        return this.value === 'suspended';
    }
    canBeEdited() {
        return this.value === 'draft';
    }
    canBeDeleted() {
        return this.value === 'draft';
    }
    canBeSubmittedForAudit() {
        return this.value === 'draft';
    }
    equals(other) {
        return this.value === other.value;
    }
    toString() {
        return this.value;
    }
}
