import { z } from 'zod';

export const simulateCardPaymentSchema = z.object({
  compensation_id: z.string().min(1).max(64),
  card_number: z.string().min(12).max(25),
  cardholder_name: z.string().min(2).max(120),
  expiration_month: z.number().int().min(1).max(12),
  expiration_year: z.number().int().min(2000).max(9999),
  cvv: z.string().min(3).max(4),
  installments: z.number().int().min(1).max(12).default(1),
});

export type SimulateCardPaymentRequest = z.infer<
  typeof simulateCardPaymentSchema
>;
