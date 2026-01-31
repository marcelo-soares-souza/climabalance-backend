import type { Clock } from '../../domain/services/clock';

/**
 * Implementation of Clock using system time.
 * Returns the actual current time.
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
