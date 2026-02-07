export async function getAreaCapacity(deps, areaId) {
    const available = await deps.carbonStockService.getAvailableCapacity(areaId);
    return {
        availableTCO2e: available,
    };
}
