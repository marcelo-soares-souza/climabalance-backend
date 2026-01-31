import { z } from 'zod';
import { emailSchema, passwordSchema, localeSchema, tokenSchema } from './common-schemas';

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  password_confirm: z.string({ required_error: 'required' }),
  locale: localeSchema,
  role_key: z.enum(['individual', 'producer', 'legal_entity'], {
    errorMap: () => ({ message: 'invalid' })
  }).optional()
}).refine(
  (data) => data.password === data.password_confirm,
  { message: 'mismatch', path: ['password_confirm'] }
);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ required_error: 'required' }).min(1, { message: 'required' }).max(200, { message: 'too_long' })
});

export const confirmEmailSchema = z.object({
  token: tokenSchema
});

export const resendConfirmationSchema = z.object({
  email: emailSchema
});

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
  locale: localeSchema
});

export const resetPasswordSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
  password_confirm: z.string({ required_error: 'required' })
}).refine(
  (data) => data.password === data.password_confirm,
  { message: 'mismatch', path: ['password_confirm'] }
);
