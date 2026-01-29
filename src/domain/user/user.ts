export type UserStatus = 'active' | 'pending' | 'suspended';

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  passwordHashVersion?: string;
  status: UserStatus;
  locale: string;
  emailConfirmedAt?: Date | null;
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
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export type UserRole = {
  id: string;
  roleKey: string;
};
