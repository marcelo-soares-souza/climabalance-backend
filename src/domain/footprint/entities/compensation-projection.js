/**
 * Calculate trees needed for compensation
 *
 * @param totalTCO2e - Total CO2e to compensate in tons
 * @param tCO2ePerTreePerYear - CO2e sequestered by one tree per year
 * @param horizonYears - Time horizon for compensation in years
 * @returns Number of trees needed
 */
export function calculateTreesNeeded(totalTCO2e, tCO2ePerTreePerYear, horizonYears) {
    if (tCO2ePerTreePerYear <= 0) {
        throw new Error('CO2e per tree per year must be positive');
    }
    if (horizonYears <= 0) {
        throw new Error('Horizon years must be positive');
    }
    const totalSequestrationPerTree = tCO2ePerTreePerYear * horizonYears;
    return Math.ceil(totalTCO2e / totalSequestrationPerTree);
}
