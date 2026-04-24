import { z } from 'zod';
import { emailSchema } from './common-schemas';
const userStatusSchema = z.enum(['active', 'pending', 'suspended'], {
    errorMap: () => ({ message: 'invalid' })
});
const optionalTrimmedString = (max) => z.preprocess((value) => {
    if (typeof value !== 'string')
        return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
}, z.string().max(max, { message: 'too_long' }).optional());
export const updateUserSchema = z.object({
    email: emailSchema.optional(),
    password: z.string().min(8, { message: 'too_short' }).max(200, { message: 'too_long' }).optional(),
    locale: z.string().min(1).max(10).optional(),
    status: userStatusSchema.optional()
});
export const upsertProfileSchema = z.object({
    display_name: optionalTrimmedString(200),
    document_type: optionalTrimmedString(30),
    document_number: optionalTrimmedString(50),
    birth_date: optionalTrimmedString(20),
    phone: optionalTrimmedString(50),
    country_code: optionalTrimmedString(2),
    address_line1: optionalTrimmedString(200),
    address_line2: optionalTrimmedString(200),
    address_city: optionalTrimmedString(120),
    address_state: optionalTrimmedString(120),
    address_postal_code: optionalTrimmedString(30),
    address_country: optionalTrimmedString(2)
});
