/**
 * Biome Value Object
 * Represents Brazilian biomes
 */
export type BiomeValue =
  | 'cerrado'
  | 'amazonia'
  | 'mata_atlantica'
  | 'caatinga'
  | 'pampa'
  | 'pantanal';

export class Biome {
  private constructor(readonly value: BiomeValue) {}

  static CERRADO = new Biome('cerrado');
  static AMAZONIA = new Biome('amazonia');
  static MATA_ATLANTICA = new Biome('mata_atlantica');
  static CAATINGA = new Biome('caatinga');
  static PAMPA = new Biome('pampa');
  static PANTANAL = new Biome('pantanal');

  static fromString(value: string): Biome {
    const normalized = value.toLowerCase().replace(/\s+/g, '_') as BiomeValue;

    switch (normalized) {
      case 'cerrado':
        return Biome.CERRADO;
      case 'amazonia':
      case 'amazônia' as BiomeValue:
        return Biome.AMAZONIA;
      case 'mata_atlantica':
      case 'mata_atlântica' as BiomeValue:
        return Biome.MATA_ATLANTICA;
      case 'caatinga':
        return Biome.CAATINGA;
      case 'pampa':
        return Biome.PAMPA;
      case 'pantanal':
        return Biome.PANTANAL;
      default:
        throw new Error(`Invalid biome: ${value}`);
    }
  }

  static all(): Biome[] {
    return [
      Biome.CERRADO,
      Biome.AMAZONIA,
      Biome.MATA_ATLANTICA,
      Biome.CAATINGA,
      Biome.PAMPA,
      Biome.PANTANAL,
    ];
  }

  getDisplayName(): string {
    const names: Record<BiomeValue, string> = {
      cerrado: 'Cerrado',
      amazonia: 'Amazônia',
      mata_atlantica: 'Mata Atlântica',
      caatinga: 'Caatinga',
      pampa: 'Pampa',
      pantanal: 'Pantanal',
    };

    return names[this.value];
  }

  equals(other: Biome): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
