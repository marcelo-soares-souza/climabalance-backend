/**
 * Carbon Capacity Value Object
 * Represents the carbon sequestration capacity of an area
 */
export class CarbonCapacity {
    totalCapacityTCO2e;
    committedTCO2e;
    constructor(totalCapacity, committed = 0) {
        if (totalCapacity < 0) {
            throw new Error('Total capacity cannot be negative');
        }
        if (committed < 0) {
            throw new Error('Committed capacity cannot be negative');
        }
        if (committed > totalCapacity) {
            throw new Error('Committed capacity cannot exceed total capacity');
        }
        this.totalCapacityTCO2e = totalCapacity;
        this.committedTCO2e = committed;
    }
    get availableTCO2e() {
        return this.totalCapacityTCO2e - this.committedTCO2e;
    }
    get utilizationPercentage() {
        if (this.totalCapacityTCO2e === 0)
            return 0;
        return (this.committedTCO2e / this.totalCapacityTCO2e) * 100;
    }
    hasAvailableCapacity() {
        return this.availableTCO2e > 0;
    }
    canReserve(amountTCO2e) {
        return amountTCO2e > 0 && amountTCO2e <= this.availableTCO2e;
    }
    reserve(amountTCO2e) {
        if (!this.canReserve(amountTCO2e)) {
            throw new Error(`Cannot reserve ${amountTCO2e} tCO2e. Available: ${this.availableTCO2e} tCO2e`);
        }
        return new CarbonCapacity(this.totalCapacityTCO2e, this.committedTCO2e + amountTCO2e);
    }
    release(amountTCO2e) {
        if (amountTCO2e < 0) {
            throw new Error('Release amount cannot be negative');
        }
        if (amountTCO2e > this.committedTCO2e) {
            throw new Error(`Cannot release ${amountTCO2e} tCO2e. Committed: ${this.committedTCO2e} tCO2e`);
        }
        return new CarbonCapacity(this.totalCapacityTCO2e, this.committedTCO2e - amountTCO2e);
    }
    equals(other) {
        return (this.totalCapacityTCO2e === other.totalCapacityTCO2e &&
            this.committedTCO2e === other.committedTCO2e);
    }
    toString() {
        return `${this.availableTCO2e.toFixed(2)} / ${this.totalCapacityTCO2e.toFixed(2)} tCO2e available (${this.utilizationPercentage.toFixed(1)}% utilized)`;
    }
    toJSON() {
        return {
            total_capacity_t_co2e: this.totalCapacityTCO2e,
            committed_t_co2e: this.committedTCO2e,
            available_t_co2e: this.availableTCO2e,
            utilization_percentage: this.utilizationPercentage,
        };
    }
}
