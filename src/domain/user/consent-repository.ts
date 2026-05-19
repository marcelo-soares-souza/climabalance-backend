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
  updateSubjectRequestStatus(
    id: string,
    status: string,
    resolvedByUserId?: string,
    resolutionNotes?: string,
  ): Promise<SubjectRequest | null>;
}
