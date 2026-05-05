import { Location } from '../value-objects/location';
import { AreaStatus } from '../value-objects/area-status';
import { AuditStatus } from '../value-objects/audit-status';
import { Biome } from '../value-objects/biome';
import { CarbonCapacity } from '../value-objects/carbon-capacity';

export interface AreaProps {
  id: string;
  ownerUserId: string;
  name: string;
  description?: string;
  location: Location;
  biome?: Biome;
  countryCode?: string;
  state?: string;
  city?: string;
  status: AreaStatus;
  auditStatus?: AuditStatus;
  auditNotes?: string;
  auditedByUserId?: string;
  auditedAt?: Date;
  carbonCapacity?: CarbonCapacity;
  maxPurchasableTrees: number | null;
  tCO2ePerTreePerYear?: number;
  pricePerTree?: number;
  defaultHorizonYears?: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * Area Entity
 * Represents a reforestation area/project with point-based location
 */
export class Area {
  readonly id: string;
  readonly ownerUserId: string;
  name: string;
  description?: string;
  location: Location;
  biome?: Biome;
  countryCode?: string;
  state?: string;
  city?: string;
  status: AreaStatus;
  auditStatus?: AuditStatus;
  auditNotes?: string;
  auditedByUserId?: string;
  auditedAt?: Date;
  carbonCapacity?: CarbonCapacity;
  maxPurchasableTrees: number | null;
  tCO2ePerTreePerYear?: number;
  pricePerTree?: number;
  defaultHorizonYears?: number;
  readonly createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;

  constructor(props: AreaProps) {
    this.id = props.id;
    this.ownerUserId = props.ownerUserId;
    this.name = props.name;
    this.description = props.description;
    this.location = props.location;
    this.biome = props.biome;
    this.countryCode = props.countryCode;
    this.state = props.state;
    this.city = props.city;
    this.status = props.status;
    this.auditStatus = props.auditStatus;
    this.auditNotes = props.auditNotes;
    this.auditedByUserId = props.auditedByUserId;
    this.auditedAt = props.auditedAt;
    this.carbonCapacity = props.carbonCapacity;
    this.maxPurchasableTrees = props.maxPurchasableTrees;
    this.tCO2ePerTreePerYear = props.tCO2ePerTreePerYear;
    this.pricePerTree = props.pricePerTree;
    this.defaultHorizonYears = props.defaultHorizonYears;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.deletedAt = props.deletedAt;
  }

  // Business rules

  canBeEditedBy(userId: string, isAdmin = false): boolean {
    const canEdit = this.status.canBeEditedFor(isAdmin);
    if (isAdmin) {
      return canEdit;
    }
    return this.ownerUserId === userId && canEdit;
  }

  canBeDeletedBy(userId: string, isAdmin = false): boolean {
    if (isAdmin) {
      return true;
    }
    return this.ownerUserId === userId;
  }

  canBeSubmittedForAudit(): boolean {
    return this.status.canBeSubmittedForAudit() && this.isComplete();
  }

  isComplete(): boolean {
    // Area must have minimum required fields to be submitted
    return (
      !!this.name &&
      this.name.length >= 3 &&
      !!this.location &&
      this.location.isValid()
    );
  }

  isActive(): boolean {
    return this.status.isActive() && !this.isDeleted();
  }

  isDeleted(): boolean {
    return !!this.deletedAt;
  }

  hasAvailableCapacity(): boolean {
    return !!this.carbonCapacity && this.carbonCapacity.hasAvailableCapacity();
  }

  getEffectiveMaxPurchasableTrees(defaultMax: number): number {
    return this.maxPurchasableTrees ?? defaultMax;
  }

  // State transitions

  submitForAudit(): void {
    if (!this.canBeSubmittedForAudit()) {
      throw new Error('Area cannot be submitted for audit');
    }

    if (!this.status.canTransitionTo(AreaStatus.PENDING_AUDIT)) {
      throw new Error(`Cannot transition from ${this.status} to pending_audit`);
    }

    this.status = AreaStatus.PENDING_AUDIT;
    this.auditStatus = AuditStatus.PENDING;
    this.updatedAt = new Date();
  }

  approve(analystId: string, notes?: string): void {
    if (!this.status.isPendingAudit()) {
      throw new Error('Area must be in pending_audit status to be approved');
    }

    if (!this.status.canTransitionTo(AreaStatus.APPROVED)) {
      throw new Error(`Cannot transition from ${this.status} to approved`);
    }

    this.status = AreaStatus.APPROVED;
    this.auditStatus = AuditStatus.APPROVED;
    this.auditedByUserId = analystId;
    this.auditedAt = new Date();
    this.auditNotes = notes;
    this.updatedAt = new Date();
  }

  reject(analystId: string, reason: string): void {
    if (!this.status.isPendingAudit()) {
      throw new Error('Area must be in pending_audit status to be rejected');
    }

    if (!this.status.canTransitionTo(AreaStatus.REJECTED)) {
      throw new Error(`Cannot transition from ${this.status} to rejected`);
    }

    this.status = AreaStatus.REJECTED;
    this.auditStatus = AuditStatus.REJECTED;
    this.auditedByUserId = analystId;
    this.auditedAt = new Date();
    this.auditNotes = reason;
    this.updatedAt = new Date();
  }

  activate(): void {
    if (!this.status.isApproved()) {
      throw new Error('Area must be approved before activation');
    }

    if (!this.status.canTransitionTo(AreaStatus.ACTIVE)) {
      throw new Error(`Cannot transition from ${this.status} to active`);
    }

    this.status = AreaStatus.ACTIVE;
    this.updatedAt = new Date();
  }

  suspend(): void {
    if (!this.status.isActive()) {
      throw new Error('Only active areas can be suspended');
    }

    if (!this.status.canTransitionTo(AreaStatus.SUSPENDED)) {
      throw new Error(`Cannot transition from ${this.status} to suspended`);
    }

    this.status = AreaStatus.SUSPENDED;
    this.updatedAt = new Date();
  }

  // Carbon capacity operations

  reserveCapacity(amountTCO2e: number): void {
    if (!this.carbonCapacity) {
      throw new Error('Area does not have carbon capacity defined');
    }

    if (!this.isActive()) {
      throw new Error('Area must be active to reserve capacity');
    }

    this.carbonCapacity = this.carbonCapacity.reserve(amountTCO2e);
    this.updatedAt = new Date();
  }

  releaseCapacity(amountTCO2e: number): void {
    if (!this.carbonCapacity) {
      throw new Error('Area does not have carbon capacity defined');
    }

    this.carbonCapacity = this.carbonCapacity.release(amountTCO2e);
    this.updatedAt = new Date();
  }

  // Mutations

  update(
    updates: {
      name?: string;
      description?: string;
      location?: Location;
      biome?: Biome;
      countryCode?: string;
      state?: string;
      city?: string;
      totalCapacityTCO2e?: number;
      maxPurchasableTrees?: number | null;
      tCO2ePerTreePerYear?: number;
      pricePerTree?: number;
      defaultHorizonYears?: number;
    },
    options?: { forceEdit?: boolean }
  ): void {
    if (!options?.forceEdit && !this.status.canBeEdited()) {
      throw new Error('Area cannot be edited in current status');
    }

    if (updates.name !== undefined) {
      if (updates.name.length < 3) {
        throw new Error('Name must be at least 3 characters');
      }
      this.name = updates.name;
    }

    if (updates.description !== undefined) {
      this.description = updates.description;
    }

    if (updates.location !== undefined) {
      this.location = updates.location;
    }

    if (updates.biome !== undefined) {
      this.biome = updates.biome;
    }

    if (updates.countryCode !== undefined) {
      this.countryCode = updates.countryCode;
    }

    if (updates.state !== undefined) {
      this.state = updates.state;
    }

    if (updates.city !== undefined) {
      this.city = updates.city;
    }

    if (updates.totalCapacityTCO2e !== undefined) {
      const committed = this.carbonCapacity?.committedTCO2e || 0;
      this.carbonCapacity = new CarbonCapacity(updates.totalCapacityTCO2e, committed);
    }

    if (updates.maxPurchasableTrees !== undefined) {
      this.maxPurchasableTrees = updates.maxPurchasableTrees;
    }

    if (updates.tCO2ePerTreePerYear !== undefined) {
      this.tCO2ePerTreePerYear = updates.tCO2ePerTreePerYear;
    }

    if (updates.pricePerTree !== undefined) {
      if (updates.pricePerTree <= 0) {
        throw new Error('Price per tree must be positive');
      }
      this.pricePerTree = updates.pricePerTree;
    }

    if (updates.defaultHorizonYears !== undefined) {
      if (updates.defaultHorizonYears <= 0) {
        throw new Error('Default horizon years must be positive');
      }
      this.defaultHorizonYears = updates.defaultHorizonYears;
    }

    this.updatedAt = new Date();
  }

  softDelete(): void {
    this.deletedAt = new Date();
    this.updatedAt = new Date();
  }
}
