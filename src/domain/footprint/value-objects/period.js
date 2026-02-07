/**
 * Period value object for calculations
 */
export class Period {
    start;
    end;
    constructor(start, end) {
        this.start = start;
        this.end = end;
        this.validate();
    }
    validate() {
        if (this.start >= this.end) {
            throw new Error('Period start must be before end');
        }
        const maxPeriodDays = 366; // Max 1 year
        const diffMs = this.end.getTime() - this.start.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > maxPeriodDays) {
            throw new Error(`Period cannot exceed ${maxPeriodDays} days`);
        }
    }
    /**
     * Check if this period is in the future
     */
    isFuture() {
        const now = new Date();
        return this.start > now;
    }
    /**
     * Get period duration in days
     */
    durationInDays() {
        const diffMs = this.end.getTime() - this.start.getTime();
        return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }
    /**
     * Check if period is approximately monthly (28-31 days)
     */
    isMonthly() {
        const days = this.durationInDays();
        return days >= 28 && days <= 31;
    }
    /**
     * Check if period is approximately annual (365-366 days)
     */
    isAnnual() {
        const days = this.durationInDays();
        return days >= 365 && days <= 366;
    }
    /**
     * Format as ISO date strings
     */
    toJSON() {
        return {
            start: this.start.toISOString().split('T')[0],
            end: this.end.toISOString().split('T')[0]
        };
    }
    static fromStrings(start, end) {
        return new Period(new Date(start), new Date(end));
    }
}
