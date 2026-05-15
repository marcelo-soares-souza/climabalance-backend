import { z } from 'zod';

/**
 * Footprint input schema
 */
export const footprintInputSchema = z.object({
  category: z.enum(['energy', 'fuel', 'transport', 'flights', 'scope1', 'scope2', 'scope3']),
  unit: z.string().min(1),
  value: z.number().positive(),
  metadata: z.record(z.string(), z.any()).optional()
});

/**
 * Create footprint calculation schema
 */
export const createCalculationSchema = z.object({
  profile_type: z.enum(['individual', 'legal_entity']),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  inputs: z.array(footprintInputSchema).min(1, 'At least one input is required'),
  data_quality: z.enum(['real', 'estimated']).optional(),
  factors_version: z.string().optional(),
  region: z.string().optional()
});

/**
 * Guest footprint calculation schema (no user_id required)
 */
export const calculateGuestSchema = z.object({
  profile_type: z.enum(['individual', 'legal_entity']),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  inputs: z.array(footprintInputSchema).min(1, 'At least one input is required'),
  data_quality: z.enum(['real', 'estimated']).optional(),
  factors_version: z.string().optional(),
  region: z.string().optional()
});

/**
 * Update footprint calculation schema
 */
export const updateCalculationSchema = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  inputs: z.array(footprintInputSchema).min(1).optional(),
  data_quality: z.enum(['real', 'estimated']).optional()
});

/**
 * Create compensation projection schema
 */
export const createProjectionSchema = z.object({
  area_id: z.string().min(1, 'Area ID is required'),
  horizon_years: z.number().positive().optional()
});

export const listCalculationsQuerySchema = z.object({
  status: z.enum(['draft', 'finalized']).optional(),
  profile_type: z.enum(['individual', 'legal_entity']).optional(),
  user_email: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const emissionFactorsQuerySchema = z.object({
  version: z.string().trim().min(1).optional(),
  region: z.string().trim().min(1).optional(),
  category: z.enum(['energy', 'fuel', 'transport', 'flights', 'scope1', 'scope2', 'scope3']).optional(),
});

/**
 * Helper to parse with schema
 */
