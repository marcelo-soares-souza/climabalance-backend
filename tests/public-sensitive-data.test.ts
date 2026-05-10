import { describe, expect, test } from 'bun:test';
import { createUserHandlers } from '../src/infrastructure/http/user-handlers';
import { createAreaHandlers } from '../src/infrastructure/http/area-handlers';
import type { HttpContext } from '../src/shared/http/router';
import type { User, UserProfile } from '../src/domain/user/user';
import { Area } from '../src/domain/areas/entities/area';
import { AreaStatus } from '../src/domain/areas/value-objects/area-status';
import { Location } from '../src/domain/areas/value-objects/location';

function buildGetContext(
  path: string,
  auth?: { userId: string; roles: string[] },
): HttpContext {
  return {
    request: new Request(`http://localhost${path}`),
    params: {},
    query: new URL(`http://localhost${path}`).searchParams,
    requestId: 'req-1',
    clientIp: '127.0.0.1',
    auth,
  };
}

function buildJsonContext(
  path: string,
  body: unknown,
  auth?: { userId: string; roles: string[] },
): HttpContext {
  return {
    request: new Request(`http://localhost${path}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: {},
    query: new URL(`http://localhost${path}`).searchParams,
    requestId: 'req-1',
    clientIp: '127.0.0.1',
    auth,
  };
}

describe('public sensitive data masking', () => {
  const user: User = {
    id: 'user-1',
    email: 'marcelo@example.com',
    passwordHash: 'hash',
    slug: 'marcelo',
    status: 'active',
    locale: 'pt-BR',
    emailConfirmedAt: new Date('2026-01-01T00:00:00Z'),
    lastLoginAt: new Date('2026-05-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    deletedAt: null,
  };

  const profile: UserProfile = {
    id: 'profile-1',
    userId: user.id,
    displayName: 'Marcelo',
    documentType: 'cpf',
    documentNumber: '12345678901',
    birthDate: '1990-01-01',
    phone: '5511999999999',
    countryCode: 'BR',
    addressLine1: 'Street 1',
    addressCity: 'Sao Paulo',
    addressState: 'SP',
    addressPostalCode: '01000-000',
    addressCountry: 'BR',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    deletedAt: null,
  };

  const usersRepo = {
    findById: async (id: string) => (id === user.id ? user : null),
    findBySlug: async (slug: string) => (slug === user.slug ? user : null),
    getRoles: async () => ['individual'],
    getProfile: async (userId: string) => (userId === user.id ? profile : null),
    listPublicDirectory: async () => [],
  } as any;

  test('public user summary returns masked email only', async () => {
    const handlers = createUserHandlers({
      users: usersRepo,
      auditLog: { log: async () => {} },
      passwordHasher: {} as any,
      profileAvatarStorage: {} as any,
      calculationRepository: {
        sumFinalizedTCO2eByUser: async () => 0,
      },
      compensationHistoryRepository: {
        getPaidContributionSummaryBySupporter: async () => ({
          estimatedOffsetTCO2e: 0,
          totalTreesPurchased: 0,
          totalContributionAmount: 0,
        }),
      },
    });

    const response = await handlers.get(
      buildGetContext('/api/v1/users/marcelo'),
      'marcelo',
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.email).toBeUndefined();
    expect(payload.data.email_masked).toBe('ma***@example.com');
  });

  test('public user profile returns masked document only', async () => {
    const handlers = createUserHandlers({
      users: usersRepo,
      auditLog: { log: async () => {} },
      passwordHasher: {} as any,
      profileAvatarStorage: {} as any,
      calculationRepository: {
        sumFinalizedTCO2eByUser: async () => 0,
      },
      compensationHistoryRepository: {
        getPaidContributionSummaryBySupporter: async () => ({
          estimatedOffsetTCO2e: 0,
          totalTreesPurchased: 0,
          totalContributionAmount: 0,
        }),
      },
    });

    const response = await handlers.getProfile(
      buildGetContext('/api/v1/users/marcelo/profile'),
      'marcelo',
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.document_type).toBeUndefined();
    expect(payload.data.document_number).toBeUndefined();
    expect(payload.data.document_number_masked).toBe('***8901');
    expect(payload.data.birth_date).toBeUndefined();
    expect(payload.data.birth_date_masked).toBe('****-**-**');
  });

  test('self user profile still returns real document', async () => {
    const handlers = createUserHandlers({
      users: usersRepo,
      auditLog: { log: async () => {} },
      passwordHasher: {} as any,
      profileAvatarStorage: {} as any,
      calculationRepository: {
        sumFinalizedTCO2eByUser: async () => 0,
      },
      compensationHistoryRepository: {
        getPaidContributionSummaryBySupporter: async () => ({
          estimatedOffsetTCO2e: 0,
          totalTreesPurchased: 0,
          totalContributionAmount: 0,
        }),
      },
    });

    const response = await handlers.getProfile(
      buildGetContext('/api/v1/users/marcelo/profile', {
        userId: user.id,
        roles: ['individual'],
      }),
      'marcelo',
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.document_type).toBe('cpf');
    expect(payload.data.document_number).toBe('12345678901');
    expect(payload.data.document_number_masked).toBe('***8901');
    expect(payload.data.birth_date).toBe('1990-01-01');
    expect(payload.data.birth_date_masked).toBe('****-**-**');
  });

  test('self update rejects sensitive fields', async () => {
    let updateCalled = false;
    const auditLogs: any[] = [];
    const handlers = createUserHandlers({
      users: {
        ...usersRepo,
        update: async () => {
          updateCalled = true;
          return user;
        },
      },
      auditLog: { log: async (entry: any) => { auditLogs.push(entry); } },
      passwordHasher: {
        hash: async () => 'new-hash',
      } as any,
      profileAvatarStorage: {} as any,
      calculationRepository: {
        sumFinalizedTCO2eByUser: async () => 0,
      },
      compensationHistoryRepository: {
        getPaidContributionSummaryBySupporter: async () => ({
          estimatedOffsetTCO2e: 0,
          totalTreesPurchased: 0,
          totalContributionAmount: 0,
        }),
      },
    });

    const response = await handlers.update(
      buildJsonContext(
        '/api/v1/users/marcelo',
        { status: 'suspended' },
        { userId: user.id, roles: ['individual'] },
      ),
      'marcelo',
    );

    expect(response.status).toBe(403);
    expect(updateCalled).toBe(false);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      action: 'user.update.forbidden_sensitive_self_update',
      entityType: 'user',
      entityId: user.id,
      success: false,
      httpStatus: 403,
      isSensitive: true,
    });
    expect(auditLogs[0].changedFields).toEqual(['status']);
  });

  test('self update still allows locale', async () => {
    let updatedLocale: string | undefined;
    const auditLogs: any[] = [];
    const handlers = createUserHandlers({
      users: {
        ...usersRepo,
        update: async (input: { locale?: string }) => {
          updatedLocale = input.locale;
          return { ...user, locale: input.locale ?? user.locale };
        },
      },
      auditLog: { log: async (entry: any) => { auditLogs.push(entry); } },
      passwordHasher: {} as any,
      profileAvatarStorage: {} as any,
      calculationRepository: {
        sumFinalizedTCO2eByUser: async () => 0,
      },
      compensationHistoryRepository: {
        getPaidContributionSummaryBySupporter: async () => ({
          estimatedOffsetTCO2e: 0,
          totalTreesPurchased: 0,
          totalContributionAmount: 0,
        }),
      },
    });

    const response = await handlers.update(
      buildJsonContext(
        '/api/v1/users/marcelo',
        { locale: 'en' },
        { userId: user.id, roles: ['individual'] },
      ),
      'marcelo',
    );

    expect(response.status).toBe(200);
    expect(updatedLocale).toBe('en');
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      action: 'user.updated',
      entityType: 'user',
      entityId: user.id,
      success: true,
      isSensitive: true,
      previousState: {
        emailMasked: 'ma***@example.com',
        locale: 'pt-BR',
      },
      newState: {
        emailMasked: 'ma***@example.com',
        locale: 'en',
      },
    });
    expect(auditLogs[0].changedFields).toEqual(['locale']);
  });

  test('public area detail returns masked owner email only', async () => {
    const area = new Area({
      id: 'area-1',
      ownerUserId: user.id,
      name: 'My Garden',
      slug: 'my-garden',
      location: new Location(-23.55, -46.63),
      status: new AreaStatus('active'),
      maxPurchasableTrees: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    const handlers = createAreaHandlers({
      users: usersRepo,
      areaRepository: {
        findById: async (id: string) => (id === area.id ? area : null),
        findBySlug: async (slug: string) => (slug === area.slug ? area : null),
      } as any,
      areaCriteriaRepository: {
        findByAreaId: async () => [],
      } as any,
      areaMediaRepository: {} as any,
      areaMediaStorage: {} as any,
      areaSatelliteImageRepository: {} as any,
      satelliteImageStorage: {} as any,
      treePlantingRepository: {} as any,
      auditLog: { log: async () => {} },
      unitOfWork: {} as any,
      idGenerator: {} as any,
      clock: {} as any,
      jobQueue: { enqueue: async () => {} } as any,
      satelliteBboxSizeKm: 1,
      satelliteMaxCloud: 10,
      satelliteDaysBack: 30,
      earthSearchEnabled: false,
    });

    const response = await handlers.get(
      buildGetContext('/api/v1/areas/my-garden'),
      'my-garden',
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.ownerEmail).toBeUndefined();
    expect(payload.data.ownerEmailMasked).toBe('ma***@example.com');
  });
});
