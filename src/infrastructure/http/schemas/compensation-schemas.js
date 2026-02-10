import { z } from 'zod';
const currencySchema = z
    .string({ required_error: 'required' })
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase());
export const createCompensationSchema = z
    .object({
    area_id: z.string({ required_error: 'required' }).min(1, 'required'),
    calculation_id: z.string().min(1).optional(),
    compensation_mode: z.enum(['tco2e', 'tree_purchase']).optional(),
    total_t_co2e: z.number().positive().optional(),
    trees_count: z.number().int().positive().optional(),
    total_amount: z.number().positive().optional(),
    trees_requested: z.number().int().positive().optional(),
    currency: currencySchema,
})
    .superRefine((value, ctx) => {
    const mode = value.compensation_mode ?? 'tco2e';
    if (mode === 'tco2e') {
        if (value.total_t_co2e == null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['total_t_co2e'],
                message: 'required',
            });
        }
        if (value.trees_count == null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['trees_count'],
                message: 'required',
            });
        }
        if (value.total_amount == null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['total_amount'],
                message: 'required',
            });
        }
        return;
    }
    if (mode === 'tree_purchase') {
        if (value.trees_requested == null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['trees_requested'],
                message: 'required',
            });
        }
        return;
    }
});
export const quoteTreePurchaseSchema = z.object({
    area_id: z.string({ required_error: 'required' }).min(1, 'required'),
    trees_requested: z.number().int().positive(),
    currency: currencySchema,
});
export const listCompensationsQuerySchema = z.object({
    status: z.enum(['pending', 'paid', 'canceled', 'refunded']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
});
export const listAreaContributionsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
});
