import { z } from 'zod';

export const createPaymentIntentSchema = z.object({
  compensation_id: z.string().min(1).max(64),
  payment_method: z.enum(['card', 'pix']),
});

export type CreatePaymentIntentRequest = z.infer<
  typeof createPaymentIntentSchema
>;
