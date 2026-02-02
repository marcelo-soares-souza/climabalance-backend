export interface AreaCriterionProps {
  id: string;
  areaId: string;
  criterionKey: string;
  criterionLabel: string;
  met: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * Area Criterion Entity
 * Represents a single socio-environmental criterion in an area audit
 */
export class AreaCriterion {
  readonly id: string;
  readonly areaId: string;
  readonly criterionKey: string;
  readonly criterionLabel: string;
  met: boolean;
  notes?: string;
  readonly createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;

  constructor(props: AreaCriterionProps) {
    this.id = props.id;
    this.areaId = props.areaId;
    this.criterionKey = props.criterionKey;
    this.criterionLabel = props.criterionLabel;
    this.met = props.met;
    this.notes = props.notes;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.deletedAt = props.deletedAt;
  }

  static create(props: {
    id: string;
    areaId: string;
    criterionKey: string;
    criterionLabel: string;
    met: boolean;
    notes?: string;
  }): AreaCriterion {
    const now = new Date();

    return new AreaCriterion({
      id: props.id,
      areaId: props.areaId,
      criterionKey: props.criterionKey,
      criterionLabel: props.criterionLabel,
      met: props.met,
      notes: props.notes,
      createdAt: now,
      updatedAt: now,
    });
  }

  isMet(): boolean {
    return this.met === true;
  }

  isNotMet(): boolean {
    return this.met === false;
  }

  updateMetStatus(met: boolean, notes?: string): void {
    this.met = met;
    if (notes !== undefined) {
      this.notes = notes;
    }
    this.updatedAt = new Date();
  }
}
