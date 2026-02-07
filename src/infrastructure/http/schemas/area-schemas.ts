import { z } from 'zod';

/**
 * Schema for creating a new area
 */
export const createAreaSchema = z.object({
  name: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  biome: z.enum(['cerrado', 'amazonia', 'mata_atlantica', 'caatinga', 'pampa', 'pantanal']).optional(),
  state: z.string().max(50).optional(),
  city: z.string().max(100).optional(),
  totalCapacityTCO2e: z.number().positive().optional(),
  tCO2ePerTreePerYear: z.number().positive().optional(),
});

export type CreateAreaRequest = z.infer<typeof createAreaSchema>;

/**
 * Schema for updating an existing area
 */
export const updateAreaSchema = z.object({
  name: z.string().min(3).max(200).optional(),
  description: z.string().max(2000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  biome: z.enum(['cerrado', 'amazonia', 'mata_atlantica', 'caatinga', 'pampa', 'pantanal']).optional(),
  state: z.string().max(50).optional(),
  city: z.string().max(100).optional(),
  totalCapacityTCO2e: z.number().positive().optional(),
  tCO2ePerTreePerYear: z.number().positive().optional(),
});

export type UpdateAreaRequest = z.infer<typeof updateAreaSchema>;

/**
 * Schema for area criterion in approval
 */
export const areaCriterionSchema = z
  .union([
    z.object({
      criterionKey: z.string().min(1).max(100),
      criterionLabel: z.string().min(1).max(200),
      met: z.boolean(),
      notes: z.string().max(1000).optional().nullable(),
    }),
    z.object({
      criterion_key: z.string().min(1).max(100),
      criterion_label: z.string().min(1).max(200),
      met: z.boolean(),
      notes: z.string().max(1000).optional().nullable(),
    }),
  ])
  .transform((value) => {
    if ('criterionKey' in value) {
      return {
        criterionKey: value.criterionKey,
        criterionLabel: value.criterionLabel,
        met: value.met,
        notes: value.notes ?? undefined,
      };
    }
    return {
      criterionKey: value.criterion_key,
      criterionLabel: value.criterion_label,
      met: value.met,
      notes: value.notes ?? undefined,
    };
  });

/**
 * Schema for approving an area with criteria
 */
export const approveAreaSchema = z.object({
  criteria: z.array(areaCriterionSchema).min(1),
  notes: z.string().max(2000).optional(),
});

export type ApproveAreaRequest = z.infer<typeof approveAreaSchema>;

/**
 * Schema for rejecting an area
 */
export const rejectAreaSchema = z.object({
  reason: z.string().min(10).max(2000),
});

export type RejectAreaRequest = z.infer<typeof rejectAreaSchema>;

/**
 * Schema for uploading area media (photo/video)
 */
export const uploadAreaMediaSchema = z.object({
  media_type: z.enum(['photo', 'video']),
  description: z.string().trim().max(500).optional(),
  mime_type: z.string().min(1).max(100),
  file_name: z.string().min(1).max(255),
  file_base64: z.string().min(1).max(40 * 1024 * 1024),
});

export type UploadAreaMediaRequest = z.infer<typeof uploadAreaMediaSchema>;

/**
 * Schema for listing areas with filters
 */
export const listAreasQuerySchema = z.object({
  status: z.enum(['draft', 'pending_audit', 'approved', 'active', 'rejected', 'suspended']).optional(),
  ownerUserId: z.string().uuid().optional(),
  biome: z.enum(['cerrado', 'amazonia', 'mata_atlantica', 'caatinga', 'pampa', 'pantanal']).optional(),
  onlyActive: z.string().transform((val) => val === 'true').optional(),
  limit: z.string().transform((val) => parseInt(val, 10)).optional(),
  offset: z.string().transform((val) => parseInt(val, 10)).optional(),
});

export type ListAreasQuery = z.infer<typeof listAreasQuerySchema>;

/**
 * Schema for getting areas for map with optional filter
 */
export const getMapAreasQuerySchema = z.object({
  biome: z.enum(['cerrado', 'amazonia', 'mata_atlantica', 'caatinga', 'pampa', 'pantanal']).optional(),
});

export type GetMapAreasQuery = z.infer<typeof getMapAreasQuerySchema>;
