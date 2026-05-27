import { describe, expect, it } from "bun:test";
import type { UserRepository } from "../../domain/user/user-repository";
import type { ConsentRepository } from "../../domain/user/consent-repository";
import type {
  User,
  UserProfile,
  UserConsent,
  SubjectRequest,
} from "../../domain/user/user";
import { exportUserData } from "./export-user-data";
import { UserNotFoundError } from "../../domain/errors";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "test@example.com",
    passwordHash: "hash",
    slug: "test-user",
    status: "active",
    locale: "pt-BR",
    emailConfirmedAt: new Date("2026-01-01"),
    lastLoginAt: new Date("2026-05-01"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-05-01"),
    deletedAt: null,
    ...overrides,
  };
}

function makeProfile(): UserProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    displayName: "Test User",
    documentType: "cpf",
    documentNumber: "123.456.789-00",
    birthDate: "1990-01-01",
    phone: "+5511999999999",
    countryCode: "BR",
    addressLine1: "Rua Teste, 123",
    addressLine2: "Apto 45",
    addressCity: "São Paulo",
    addressState: "SP",
    addressPostalCode: "01234-567",
    addressCountry: "Brasil",
    about: "About me",
    websiteUrl: "https://example.com",
    instagramUrl: "https://instagram.com/test",
    facebookUrl: "https://facebook.com/test",
    xUrl: "https://x.com/test",
    blueskyUrl: "https://bsky.app/test",
    mastodonUrl: "https://mastodon.social/@test",
    youtubeUrl: "https://youtube.com/@test",
    linkedinUrl: "https://linkedin.com/in/test",
    avatarPath: "/avatars/test.jpg",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-05-01"),
    deletedAt: null,
  };
}

function makeConsent(): UserConsent {
  return {
    id: "consent-1",
    userId: "user-1",
    consentType: "privacy_policy",
    consented: true,
    version: "2026-04-24",
    ipAddress: "127.0.0.1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    deletedAt: null,
  };
}

function makeSubjectRequest(): SubjectRequest {
  return {
    id: "sr-1",
    userId: "user-1",
    requestType: "erasure",
    status: "pending",
    details: "Please delete my data",
    resolutionNotes: null,
    resolvedByUserId: null,
    resolvedAt: null,
    createdAt: new Date("2026-05-01"),
    updatedAt: new Date("2026-05-01"),
    deletedAt: null,
  };
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  const user =
    "user" in overrides
      ? (overrides.user as User | null | undefined)
      : makeUser();
  const profile =
    "profile" in overrides
      ? (overrides.profile as UserProfile | null | undefined)
      : makeProfile();
  const roles =
    "roles" in overrides ? (overrides.roles as string[]) : ["individual"];
  const consents =
    "consents" in overrides
      ? (overrides.consents as UserConsent[])
      : [makeConsent()];
  const subjectRequests =
    "subjectRequests" in overrides
      ? (overrides.subjectRequests as SubjectRequest[])
      : [makeSubjectRequest()];

  return {
    users: {
      async findById(_id: string) {
        return user ?? null;
      },
      async getProfile(_userId: string) {
        return profile ?? null;
      },
      async getRoles(_userId: string) {
        return roles;
      },
    } as unknown as UserRepository,
    consents: {
      async getConsentsByUser(_userId: string) {
        return consents;
      },
      async getSubjectRequestsByUser(_userId: string) {
        return subjectRequests;
      },
    } as unknown as ConsentRepository,
    compensationHistoryRepository: {
      async getPaidContributionSummaryBySupporter(_userId: string) {
        return {
          estimatedOffsetTCO2e: 1.5,
          totalTreesPurchased: 10,
          totalContributionAmount: 500,
        };
      },
      async listBySupporter() {
        return [];
      },
    },
    compensationCertificateRepository: {
      async listBySupporterUserId() {
        return [];
      },
    },
    calculationRepository: {
      async findByUserId() {
        return [];
      },
      async sumFinalizedTCO2eByUser(_userId: string) {
        return 2.0;
      },
    },
  };
}

describe("exportUserData", () => {
  it("throws UserNotFoundError when user does not exist", async () => {
    const deps = makeDeps({
      user: null,
    });

    await expect(exportUserData("nonexistent", deps)).rejects.toThrow(
      UserNotFoundError,
    );
  });

  it("throws UserNotFoundError when user is soft-deleted", async () => {
    const deps = makeDeps({
      user: makeUser({ deletedAt: new Date("2026-05-15") }),
    });

    await expect(exportUserData("user-1", deps)).rejects.toThrow(
      UserNotFoundError,
    );
  });

  it("includes all user fields", async () => {
    const deps = makeDeps();
    const result = await exportUserData("user-1", deps);

    expect(result.user.id).toBe("user-1");
    expect(result.user.email).toBe("test@example.com");
    expect(result.user.status).toBe("active");
    expect(result.user.locale).toBe("pt-BR");
    expect(result.user.emailConfirmedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result.user.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("includes all profile fields including previously omitted ones", async () => {
    const deps = makeDeps();
    const result = await exportUserData("user-1", deps);

    expect(result.profile).not.toBeNull();
    const profile = result.profile!;

    expect(profile.displayName).toBe("Test User");
    expect(profile.documentType).toBe("cpf");
    expect(profile.documentNumber).toBe("123.456.789-00");
    expect(profile.birthDate).toBe("1990-01-01");
    expect(profile.phone).toBe("+5511999999999");
    expect(profile.countryCode).toBe("BR");
    expect(profile.addressLine1).toBe("Rua Teste, 123");
    expect(profile.addressLine2).toBe("Apto 45");
    expect(profile.addressCity).toBe("São Paulo");
    expect(profile.addressState).toBe("SP");
    expect(profile.addressPostalCode).toBe("01234-567");
    expect(profile.addressCountry).toBe("Brasil");
    expect(profile.about).toBe("About me");
    expect(profile.websiteUrl).toBe("https://example.com");
    expect(profile.instagramUrl).toBe("https://instagram.com/test");
    expect(profile.facebookUrl).toBe("https://facebook.com/test");
    expect(profile.xUrl).toBe("https://x.com/test");
    expect(profile.blueskyUrl).toBe("https://bsky.app/test");
    expect(profile.mastodonUrl).toBe("https://mastodon.social/@test");
    expect(profile.youtubeUrl).toBe("https://youtube.com/@test");
    expect(profile.linkedinUrl).toBe("https://linkedin.com/in/test");
    expect(profile.avatarPath).toBe("/avatars/test.jpg");
  });

  it("returns null profile when user has no profile", async () => {
    const deps = makeDeps({ profile: null });
    const result = await exportUserData("user-1", deps);

    expect(result.profile).toBeNull();
  });

  it("includes consents", async () => {
    const deps = makeDeps();
    const result = await exportUserData("user-1", deps);

    expect(result.consents).toHaveLength(1);
    expect(result.consents[0].type).toBe("privacy_policy");
    expect(result.consents[0].consented).toBe(true);
    expect(result.consents[0].version).toBe("2026-04-24");
  });

  it("includes subject requests", async () => {
    const deps = makeDeps();
    const result = await exportUserData("user-1", deps);

    expect(result.subjectRequests).toHaveLength(1);
    expect(result.subjectRequests[0].id).toBe("sr-1");
    expect(result.subjectRequests[0].requestType).toBe("erasure");
    expect(result.subjectRequests[0].status).toBe("pending");
    expect(result.subjectRequests[0].details).toBe("Please delete my data");
    expect(result.subjectRequests[0].resolutionNotes).toBeNull();
    expect(result.subjectRequests[0].resolvedAt).toBeNull();
  });

  it("includes roles", async () => {
    const deps = makeDeps({ roles: ["individual", "supporter"] });
    const result = await exportUserData("user-1", deps);

    expect(result.roles).toEqual(["individual", "supporter"]);
  });

  it("includes compensations, certificates, and footprints as arrays", async () => {
    const deps = makeDeps();
    const result = await exportUserData("user-1", deps);

    expect(result.compensations).toEqual([]);
    expect(result.certificates).toEqual([]);
    expect(result.footprints).toEqual([]);
  });
});
