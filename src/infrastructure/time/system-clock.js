/**
 * Implementation of Clock using system time.
 * Returns the actual current time.
 */
export class SystemClock {
    now() {
        return new Date();
    }
}
