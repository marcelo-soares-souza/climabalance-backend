import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(320, { message: 'too_long' })
  .email({ message: 'invalid_email' })
  .transform(email => email.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, { message: 'too_short' })
  .max(200, { message: 'too_long' });

export const localeSchema = z
  .string()
  .min(1)
  .max(10)
  .optional();

export const tokenSchema = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(500, { message: 'too_long' });
