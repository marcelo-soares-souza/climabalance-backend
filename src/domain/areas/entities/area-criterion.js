/**
 * Area Criterion Entity
 * Represents a single socio-environmental criterion in an area audit
 */
export class AreaCriterion {
    id;
    areaId;
    criterionKey;
    criterionLabel;
    met;
    notes;
    createdAt;
    updatedAt;
    deletedAt;
    constructor(props) {
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
    static create(props) {
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
    isMet() {
        return this.met === true;
    }
    isNotMet() {
        return this.met === false;
    }
    updateMetStatus(met, notes) {
        this.met = met;
        if (notes !== undefined) {
            this.notes = notes;
        }
        this.updatedAt = new Date();
    }
}
