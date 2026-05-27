import { z } from "zod";

export const reconcilePaymentsSchema = z.object({
  limit: z.number().int().min(1).max(500).default(100),
});

export type ReconcilePaymentsRequest = z.infer<typeof reconcilePaymentsSchema>;
