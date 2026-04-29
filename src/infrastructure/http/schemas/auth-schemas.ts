import { z } from 'zod';
import { emailSchema, passwordSchema, localeSchema, tokenSchema } from './common-schemas';

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  password_confirm: z.string().min(1, { message: 'required' }),
  human_challenge_id: z.string().min(1, { message: 'required' }),
  human_answer: z.string().trim().min(1, { message: 'required' }).max(200, { message: 'too_long' }),
  locale: localeSchema,
  role_key: z.enum(['individual', 'producer', 'legal_entity']).optional()
}).refine(
  (data) => data.password === data.password_confirm,
  { message: 'mismatch', path: ['password_confirm'] }
);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'required' }).max(200, { message: 'too_long' })
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
  password_confirm: z.string().min(1, { message: 'required' })
}).refine(
  (data) => data.password === data.password_confirm,
  { message: 'mismatch', path: ['password_confirm'] }
);

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1, { message: 'required' }).optional()
});

export const changePasswordSchema = z.object({
  old_password: z.string().min(1, { message: 'required' }).max(200, { message: 'too_long' }),
  new_password: passwordSchema,
  new_password_confirm: z.string().min(1, { message: 'required' })
}).refine(
  (data) => data.new_password === data.new_password_confirm,
  { message: 'mismatch', path: ['new_password_confirm'] }
);

export const revokeTokenSchema = z.object({
  refresh_token: z.string().min(1, { message: 'required' }).optional()
});
