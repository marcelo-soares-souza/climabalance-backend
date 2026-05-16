import { z } from 'zod';
import { emailSchema } from './common-schemas';

const userStatusSchema = z.enum(['active', 'pending', 'suspended']);

const optionalTrimmedString = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    },
    z.string().max(max, { message: 'too_long' }).optional()
  ).optional();

const optionalUrl = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    },
    z.string().max(max, { message: 'too_long' }).url({ message: 'invalid_url' }).optional()
  ).optional();

const roleSchema = z.enum(['individual', 'producer', 'legal_entity', 'analyst', 'administrator']);

export const updateUserSchema = z.object({
  email: emailSchema.optional(),
  password: z.string().min(8, { message: 'too_short' }).max(200, { message: 'too_long' }).optional(),
  locale: z.string().min(1).max(10).optional(),
  status: userStatusSchema.optional(),
  role: roleSchema.optional()
});

export const listUsersQuerySchema = z.object({
  status: userStatusSchema.optional(),
  search: optionalTrimmedString(200),
  sort_by: z.enum(['email', 'status', 'created_at', 'updated_at', 'last_login_at']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const uploadProfileAvatarSchema = z.object({
  mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  file_base64: z.string().min(1).max(10 * 1024 * 1024)
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
  address_country: optionalTrimmedString(2),
  about: optionalTrimmedString(4000),
  website_url: optionalUrl(500),
  instagram_url: optionalUrl(500),
  facebook_url: optionalUrl(500),
  x_url: optionalUrl(500),
  bluesky_url: optionalUrl(500),
  mastodon_url: optionalUrl(500),
  youtube_url: optionalUrl(500),
  linkedin_url: optionalUrl(500)
});
