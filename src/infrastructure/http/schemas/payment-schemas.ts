import { z } from "zod";

export const simulateCardPaymentSchema = z.object({
  compensation_id: z.string().min(1).max(64),
  card_number: z.string().min(12).max(25),
  cardholder_name: z.string().min(2).max(120),
  expiration_month: z.number().int().min(1).max(12),
  expiration_year: z.number().int().min(2000).max(9999),
  cvv: z.string().min(3).max(4),
  installments: z.number().int().min(1).max(12).default(1),
});

export const paymentWebhookSchema = z.object({
  provider: z.enum(["card_simulator", "stripe"]),
  event: z.string().min(1),
  data: z
    .object({
      provider_reference: z.string().min(8).max(140).optional(),
      object: z
        .object({
          id: z.string().optional(),
          status: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const reconcilePaymentsSchema = z.object({
  limit: z.number().int().min(1).max(500).default(100),
});

export type SimulateCardPaymentRequest = z.infer<
  typeof simulateCardPaymentSchema
>;

export type PaymentWebhookRequest = z.infer<typeof paymentWebhookSchema>;

export type ReconcilePaymentsRequest = z.infer<typeof reconcilePaymentsSchema>;
