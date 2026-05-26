/**
 * Period value object for calculations
 */
export class Period {
  constructor(
    public readonly start: Date,
    public readonly end: Date,
  ) {
    this.validate();
  }

  private validate(): void {
    if (this.start >= this.end) {
      throw new Error("Period start must be before end");
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
  isFuture(): boolean {
    const now = new Date();
    return this.start > now;
  }

  /**
   * Get period duration in days
   */
  durationInDays(): number {
    const diffMs = this.end.getTime() - this.start.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if period is approximately monthly (28-31 days)
   */
  isMonthly(): boolean {
    const days = this.durationInDays();
    return days >= 28 && days <= 31;
  }

  /**
   * Check if period is approximately annual (365-366 days)
   */
  isAnnual(): boolean {
    const days = this.durationInDays();
    return days >= 365 && days <= 366;
  }

  /**
   * Format as ISO date strings
   */
  toJSON(): { start: string; end: string } {
    return {
      start: this.start.toISOString().split("T")[0]!,
      end: this.end.toISOString().split("T")[0]!,
    };
  }

  static fromStrings(start: string, end: string): Period {
    const parseDate = (s: string) => {
      const [year, month, day] = s.split("-").map(Number);
      return new Date(year!, month! - 1, day!);
    };
    return new Period(parseDate(start), parseDate(end));
  }
}
