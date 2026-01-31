import { z } from 'zod';
import { emailSchema } from './common-schemas';

const userStatusSchema = z.enum(['active', 'pending', 'suspended'], {
  errorMap: () => ({ message: 'invalid' })
});

export const updateUserSchema = z.object({
  email: emailSchema.optional(),
  password: z.string().min(8, { message: 'too_short' }).max(200, { message: 'too_long' }).optional(),
  locale: z.string().min(1).max(10).optional(),
  status: userStatusSchema.optional()
});

export const upsertProfileSchema = z.object({
  display_name: z.string().trim().max(200, { message: 'too_long' }).optional(),
  document_type: z.string().trim().max(30, { message: 'too_long' }).optional(),
  document_number: z.string().trim().max(50, { message: 'too_long' }).optional(),
  birth_date: z.string().trim().max(20, { message: 'too_long' }).optional(),
  phone: z.string().trim().max(50, { message: 'too_long' }).optional(),
  country_code: z.string().trim().max(2, { message: 'too_long' }).optional(),
  address_line1: z.string().trim().max(200, { message: 'too_long' }).optional(),
  address_line2: z.string().trim().max(200, { message: 'too_long' }).optional(),
  address_city: z.string().trim().max(120, { message: 'too_long' }).optional(),
  address_state: z.string().trim().max(120, { message: 'too_long' }).optional(),
  address_postal_code: z.string().trim().max(30, { message: 'too_long' }).optional(),
  address_country: z.string().trim().max(2, { message: 'too_long' }).optional()
});
