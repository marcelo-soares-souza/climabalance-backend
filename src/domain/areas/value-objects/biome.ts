export class Biome {
  constructor(readonly value: string) {}

  toString(): string {
    return this.value;
  }

  equals(other: Biome): boolean {
    return this.value === other.value;
  }
}
