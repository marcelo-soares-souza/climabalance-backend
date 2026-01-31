/**
 * Port for accessing current time.
 * Implementation allows controlling time in tests (no more `new Date()`).
 */
export interface Clock {
  /**
   * Get the current date and time.
   * @returns The current Date
   */
  now(): Date;
}
