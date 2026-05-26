import type { UserRepository } from "../../domain/user/user-repository";
import type { ConsentRepository } from "../../domain/user/consent-repository";
import { UserNotFoundError } from "../../domain/errors";

export type UserDataExport = {
  user: {
    id: string;
    email: string;
    status: string;
    locale: string;
    emailConfirmedAt: string | null;
    createdAt: string;
  };
  profile: Record<string, unknown> | null;
  roles: string[];
  consents: Array<{
    type: string;
    consented: boolean;
    version: string | null;
    createdAt: string;
  }>;
  subjectRequests: Array<{
    id: string;
    requestType: string;
    status: string;
    details: string | null;
    resolutionNotes: string | null;
    resolvedAt: string | null;
    createdAt: string;
  }>;
  compensations: Array<Record<string, unknown>>;
  certificates: Array<Record<string, unknown>>;
  footprints: Array<Record<string, unknown>>;
};

export async function exportUserData(
  userId: string,
  deps: {
    users: UserRepository;
    consents: ConsentRepository;
    compensationHistoryRepository: {
      getPaidContributionSummaryBySupporter(userId: string): Promise<{
        estimatedOffsetTCO2e: number;
        totalTreesPurchased: number;
        totalContributionAmount: number;
      }>;
      listBySupporter(
        input: {
          supporterUserId: string;
          status?: string;
          limit: number;
          offset: number;
        },
        client?: any,
      ): Promise<any[]>;
    };
    compensationCertificateRepository: {
      listBySupporterUserId(params: {
        supporterUserId: string;
        limit: number;
        offset: number;
      }): Promise<any[]>;
    };
    calculationRepository: {
      findByUserId(
        userId: string,
        filters?: {
          status?: string;
          profile_type?: string;
          limit?: number;
          offset?: number;
        },
      ): Promise<any[]>;
      sumFinalizedTCO2eByUser(userId: string): Promise<number>;
    };
  },
): Promise<UserDataExport> {
  const user = await deps.users.findById(userId);
  if (!user || user.deletedAt) {
    throw new UserNotFoundError(userId);
  }

  const profile = await deps.users.getProfile(userId);
  const roles = await deps.users.getRoles(userId);
  const consents = await deps.consents.getConsentsByUser(userId);
  const subjectRequests = await deps.consents.getSubjectRequestsByUser(userId);
  void deps.compensationHistoryRepository.getPaidContributionSummaryBySupporter(
    userId,
  );
  void deps.calculationRepository.sumFinalizedTCO2eByUser(userId);

  const [compensations, certificates, footprints] = await Promise.all([
    deps.compensationHistoryRepository.listBySupporter({
      supporterUserId: userId,
      limit: 1000,
      offset: 0,
    }),
    deps.compensationCertificateRepository.listBySupporterUserId({
      supporterUserId: userId,
      limit: 1000,
      offset: 0,
    }),
    deps.calculationRepository.findByUserId(userId, { limit: 1000, offset: 0 }),
  ]);

  return {
    user: {
      id: user.id,
      email: user.email,
      status: user.status,
      locale: user.locale,
      emailConfirmedAt: user.emailConfirmedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    },
    profile: profile
      ? {
          displayName: profile.displayName,
          documentType: profile.documentType,
          documentNumber: profile.documentNumber,
          birthDate: profile.birthDate,
          phone: profile.phone,
          countryCode: profile.countryCode,
          addressLine1: profile.addressLine1,
          addressLine2: profile.addressLine2,
          addressCity: profile.addressCity,
          addressState: profile.addressState,
          addressPostalCode: profile.addressPostalCode,
          addressCountry: profile.addressCountry,
          about: profile.about,
          websiteUrl: profile.websiteUrl,
          instagramUrl: profile.instagramUrl,
          facebookUrl: profile.facebookUrl,
          xUrl: profile.xUrl,
          blueskyUrl: profile.blueskyUrl,
          mastodonUrl: profile.mastodonUrl,
          youtubeUrl: profile.youtubeUrl,
          linkedinUrl: profile.linkedinUrl,
          avatarPath: profile.avatarPath,
        }
      : null,
    roles,
    consents: consents.map((c) => ({
      type: c.consentType,
      consented: c.consented,
      version: c.version ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
    subjectRequests: subjectRequests.map((r) => ({
      id: r.id,
      requestType: r.requestType,
      status: r.status,
      details: r.details ?? null,
      resolutionNotes: r.resolutionNotes ?? null,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    compensations,
    certificates,
    footprints,
  };
}
