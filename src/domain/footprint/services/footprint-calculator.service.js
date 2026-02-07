import { isEmissionFactorValid } from '../entities/emission-factor';
/**
 * Footprint Calculator Service
 * Core domain service for calculating CO2 emissions from activities
 */
export class FootprintCalculatorService {
    /**
     * Calculate CO2e emissions from user inputs
     *
     * Formula: Emissions = Activity × Emission Factor
     *
     * @param inputs - Array of activity inputs
     * @param emissionFactors - Applicable emission factors
     * @returns Calculation result with total and breakdown
     */
    calculate(inputs, emissionFactors) {
        if (inputs.length === 0) {
            throw new Error('At least one input is required for calculation');
        }
        const breakdownByCategory = new Map();
        const inputsWithEmissions = [];
        let totalKgCO2e = 0;
        for (const input of inputs) {
            // Resolve activity type from input category and metadata
            const activityType = this.resolveActivityType(input);
            // Find matching emission factor
            const factor = this.findMatchingFactor(activityType, input.unit, emissionFactors);
            if (!factor) {
                throw new Error(`No emission factor found for activity type "${activityType}" with unit "${input.unit}"`);
            }
            // Calculate: emissions = activity value × factor
            const kgCO2e = input.value * factor.factor_value;
            // Aggregate by category
            const currentCategoryTotal = breakdownByCategory.get(input.category) || 0;
            breakdownByCategory.set(input.category, currentCategoryTotal + kgCO2e);
            // Track input with its emissions
            inputsWithEmissions.push({
                input,
                activity_type: activityType,
                kg_co2e: kgCO2e
            });
            totalKgCO2e += kgCO2e;
        }
        // Convert to tons
        const totalTCO2e = totalKgCO2e / 1000;
        // Build breakdown array
        const breakdown = Array.from(breakdownByCategory.entries()).map(([category, kg]) => ({
            category,
            kg_co2e: kg,
            t_co2e: kg / 1000
        }));
        return {
            total_kg_co2e: totalKgCO2e,
            total_t_co2e: totalTCO2e,
            breakdown,
            inputsWithEmissions
        };
    }
    /**
     * Resolve activity type from input category and metadata
     *
     * Examples:
     * - category="energy" → "energy_residential"
     * - category="fuel" + metadata.fuel_type="gasoline" → "fuel_gasoline"
     * - category="transport" + metadata.vehicle_type="car_medium" → "transport_car_medium"
     * - category="flights" + metadata.flight_type="domestic" + metadata.class="economy" → "flight_domestic_economy"
     */
    resolveActivityType(input) {
        const { category, metadata = {} } = input;
        switch (category) {
            case 'energy':
                // Energy is always residential for individuals
                return 'energy_residential';
            case 'fuel':
                // Fuel type must be specified in metadata
                if (!metadata.fuel_type) {
                    throw new Error('fuel_type must be specified in metadata for fuel category');
                }
                return `fuel_${metadata.fuel_type}`;
            case 'transport':
                // Vehicle type must be specified in metadata
                if (!metadata.vehicle_type) {
                    throw new Error('vehicle_type must be specified in metadata for transport category');
                }
                return `transport_${metadata.vehicle_type}`;
            case 'flights':
                // Flight type and class must be specified
                if (!metadata.flight_type || !metadata.class) {
                    throw new Error('flight_type and class must be specified in metadata for flights category');
                }
                return `flight_${metadata.flight_type}_${metadata.class}`;
            case 'scope1':
            case 'scope2':
            case 'scope3':
                // For legal entity scopes, activity_type might be more specific
                // For now, use the same resolution as individual categories
                // This can be expanded based on specific scope requirements
                if (metadata.activity_subtype) {
                    return metadata.activity_subtype;
                }
                throw new Error(`activity_subtype must be specified in metadata for ${category} category`);
            default:
                throw new Error(`Unknown category: ${category}`);
        }
    }
    /**
     * Find emission factor that matches activity type and unit
     */
    findMatchingFactor(activityType, unit, factors) {
        const now = new Date();
        return (factors.find((f) => f.activity_type === activityType &&
            f.unit === unit &&
            isEmissionFactorValid(f, now)) || null);
    }
}
