import type { UserConsent, SubjectRequest } from "./user";

export type CreateConsentInput = {
  id: string;
  userId: string;
  consentType: string;
  consented: boolean;
  version?: string;
  ipAddress?: string;
};

export type CreateSubjectRequestInput = {
  id: string;
  userId?: string;
  requestType: string;
  details?: string;
};

export interface ConsentRepository {
  recordConsent(input: CreateConsentInput): Promise<UserConsent>;
  getConsentsByUser(userId: string): Promise<UserConsent[]>;
  getConsent(userId: string, consentType: string): Promise<UserConsent | null>;
  createSubjectRequest(
    input: CreateSubjectRequestInput,
  ): Promise<SubjectRequest>;
  getSubjectRequestsByUser(userId: string): Promise<SubjectRequest[]>;
  getSubjectRequestById(id: string): Promise<SubjectRequest | null>;
  listAllSubjectRequests(filters: SubjectRequestFilters): Promise<{
    requests: SubjectRequest[];
    total: number;
  }>;
  updateSubjectRequest(
    id: string,
    updates: UpdateSubjectRequestInput,
  ): Promise<SubjectRequest | null>;
}

export type SubjectRequestFilters = {
  status?: string;
  requestType?: string;
  assignedToUserId?: string;
  limit?: number;
  offset?: number;
};

export type UpdateSubjectRequestInput = {
  status?: string;
  assigneeUserId?: string;
  resolvedByUserId?: string;
  resolutionNotes?: string;
  dueAt?: Date;
  legalBasis?: string;
  identityVerified?: boolean;
  dataCategoriesAffected?: string[];
};
