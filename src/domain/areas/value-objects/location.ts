/**
 * Location Value Object
 * Represents a point on Earth using WGS84 coordinates
 */
export class Location {
  readonly latitude: number;
  readonly longitude: number;

  constructor(latitude: number, longitude: number) {
    if (!Location.isValidLatitude(latitude)) {
      throw new Error(`Invalid latitude: ${latitude}. Must be between -90 and 90.`);
    }

    if (!Location.isValidLongitude(longitude)) {
      throw new Error(`Invalid longitude: ${longitude}. Must be between -180 and 180.`);
    }

    this.latitude = latitude;
    this.longitude = longitude;
  }

  static isValidLatitude(lat: number): boolean {
    return typeof lat === 'number' && !isNaN(lat) && lat >= -90 && lat <= 90;
  }

  static isValidLongitude(lng: number): boolean {
    return typeof lng === 'number' && !isNaN(lng) && lng >= -180 && lng <= 180;
  }

  isValid(): boolean {
    return Location.isValidLatitude(this.latitude) && Location.isValidLongitude(this.longitude);
  }

  equals(other: Location): boolean {
    return this.latitude === other.latitude && this.longitude === other.longitude;
  }

  toString(): string {
    return `(${this.latitude.toFixed(6)}, ${this.longitude.toFixed(6)})`;
  }

  /**
   * Calculate approximate distance to another location in kilometers
   * Uses Haversine formula
   */
  distanceTo(other: Location): number {
    const R = 6371; // Earth radius in km
    const dLat = this.toRadians(other.latitude - this.latitude);
    const dLon = this.toRadians(other.longitude - this.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(this.latitude)) *
        Math.cos(this.toRadians(other.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  toJSON() {
    return {
      latitude: this.latitude,
      longitude: this.longitude,
    };
  }
}
