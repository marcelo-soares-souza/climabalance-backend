export class Biome {
    value;
    constructor(value) {
        this.value = value;
    }
    static CERRADO = new Biome('cerrado');
    static AMAZONIA = new Biome('amazonia');
    static MATA_ATLANTICA = new Biome('mata_atlantica');
    static CAATINGA = new Biome('caatinga');
    static PAMPA = new Biome('pampa');
    static PANTANAL = new Biome('pantanal');
    static fromString(value) {
        const normalized = value.toLowerCase().replace(/\s+/g, '_');
        switch (normalized) {
            case 'cerrado':
                return Biome.CERRADO;
            case 'amazonia':
            case 'amazônia':
                return Biome.AMAZONIA;
            case 'mata_atlantica':
            case 'mata_atlântica':
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
    static all() {
        return [
            Biome.CERRADO,
            Biome.AMAZONIA,
            Biome.MATA_ATLANTICA,
            Biome.CAATINGA,
            Biome.PAMPA,
            Biome.PANTANAL,
        ];
    }
    getDisplayName() {
        const names = {
            cerrado: 'Cerrado',
            amazonia: 'Amazônia',
            mata_atlantica: 'Mata Atlântica',
            caatinga: 'Caatinga',
            pampa: 'Pampa',
            pantanal: 'Pantanal',
        };
        return names[this.value];
    }
    equals(other) {
        return this.value === other.value;
    }
    toString() {
        return this.value;
    }
}
