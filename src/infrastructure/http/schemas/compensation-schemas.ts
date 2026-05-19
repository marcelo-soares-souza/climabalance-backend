import { z } from "zod";

const currencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

export const createCompensationSchema = z
  .object({
    area_id: z.string().min(1, "required"),
    calculation_id: z.string().min(1).optional(),
    compensation_mode: z.literal("tree_purchase").optional(),
    trees_requested: z.number().int().positive().optional(),
    currency: currencySchema,
  })
  .superRefine((value, ctx) => {
    if (value.trees_requested == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trees_requested"],
        message: "required",
      });
    }
    if (
      value.compensation_mode != null &&
      value.compensation_mode !== "tree_purchase"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["compensation_mode"],
        message: "invalid_mode",
      });
      return;
    }
  });

export const quoteTreePurchaseSchema = z.object({
  area_id: z.string().min(1, "required"),
  trees_requested: z.number().int().positive(),
  currency: currencySchema,
});

export const listCompensationsQuerySchema = z.object({
  status: z.enum(["pending", "paid", "canceled", "refunded"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const listAreaContributionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
