import { z } from 'zod';

export const createCompensationSchema = z.object({
  area_id: z.string({ required_error: 'required' }).min(1, 'required'),
  calculation_id: z.string().min(1).optional(),
  total_t_co2e: z.number().positive(),
  trees_count: z.number().int().positive(),
  total_amount: z.number().positive(),
  currency: z
    .string({ required_error: 'required' })
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
});
