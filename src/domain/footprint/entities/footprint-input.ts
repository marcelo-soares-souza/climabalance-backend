import type { FootprintCategory } from "../value-objects/category";

/**
 * Footprint Input entity
 * Represents a single activity input for calculation
 */
export interface FootprintInput {
  id: string;
  calculation_id: string;
  activity_type: string;
  category: FootprintCategory;
  quantity: number;
  unit: string;
  kg_co2e: number;
  metadata_json: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/**
 * DTO for creating a footprint input
 */
export interface CreateFootprintInputDTO {
  category: FootprintCategory;
  unit: string;
  value: number;
  metadata?: Record<string, any>;
}

/**
 * Get metadata from input
 */
export function getInputMetadata(
  input: FootprintInput,
): Record<string, any> | null {
  if (!input.metadata_json) {
    return null;
  }

  try {
    return JSON.parse(input.metadata_json);
  } catch {
    return null;
  }
}

/**
 * Validate input value
 */
export function validateInputValue(value: number): void {
  if (value < 0) {
    throw new Error("Input value must be non-negative");
  }

  if (!isFinite(value)) {
    throw new Error("Input value must be finite");
  }
}
