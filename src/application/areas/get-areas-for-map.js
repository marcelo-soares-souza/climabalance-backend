import { Biome } from '../../domain/areas/value-objects/biome';
export async function getAreasForMap(deps, filters) {
    const repoFilters = {};
    if (filters?.biome) {
        repoFilters.biome = Biome.fromString(filters.biome);
    }
    const areas = await deps.areaRepository.findActiveWithCapacity(repoFilters);
    return areas.map((area) => ({
        id: area.id,
        name: area.name,
        latitude: area.location.latitude,
        longitude: area.location.longitude,
        biome: area.biome?.toString(),
        state: area.state,
        city: area.city,
        availableTCO2e: area.carbonCapacity?.availableTCO2e || 0,
        tCO2ePerTreePerYear: area.tCO2ePerTreePerYear,
    }));
}
