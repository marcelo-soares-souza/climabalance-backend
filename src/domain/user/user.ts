export type UserStatus = 'active' | 'pending' | 'suspended';

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  passwordHashVersion?: string;
  slug: string;
  status: UserStatus;
  locale: string;
  emailConfirmedAt?: Date | null;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export type UserProfile = {
  id: string;
  userId: string;
  displayName?: string;
  documentType?: string;
  documentNumber?: string;
  birthDate?: string;
  phone?: string;
  countryCode?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressCity?: string;
  addressState?: string;
  addressPostalCode?: string;
  addressCountry?: string;
  about?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  xUrl?: string;
  blueskyUrl?: string;
  mastodonUrl?: string;
  youtubeUrl?: string;
  linkedinUrl?: string;
  avatarPath?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export type UserRole = {
  id: string;
  roleKey: string;
};

export type UserConsent = {
  id: string;
  userId: string;
  consentType: string;
  consented: boolean;
  version?: string;
  ipAddress?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export type SubjectRequest = {
  id: string;
  userId?: string;
  requestType: string;
  status: string;
  details?: string;
  resolutionNotes?: string;
  resolvedByUserId?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};
