/**
 * Port for generating unique identifiers.
 * Implementation should provide globally unique, sortable IDs.
 */
export interface IdGenerator {
  /**
   * Generate a unique identifier.
   * @returns A unique ID string (e.g., UUIDv7)
   */
  generate(): string;
}
