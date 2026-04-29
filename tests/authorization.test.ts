import { expect, test, describe, beforeEach } from 'bun:test';
import { Area } from '../src/domain/areas/entities/area';
import { AreaStatus } from '../src/domain/areas/value-objects/area-status';
import { Location } from '../src/domain/areas/value-objects/location';
import { CarbonCapacity } from '../src/domain/areas/value-objects/carbon-capacity';
import { Biome } from '../src/domain/areas/value-objects/biome';
import { listAreas } from '../src/application/areas/list-areas';
import { signJwt } from '../src/infrastructure/crypto/jwt';
import { withAuth } from '../src/infrastructure/http/auth';
import { env } from '../src/shared/utils/env';
import type { AreaRepository, AreaFilters } from '../src/domain/areas/repositories/area-repository';

class MockAreaRepository {
  private areas: Area[] = [];

  addArea(area: Area) {
    this.areas.push(area);
  }

  async findAll(filters?: AreaFilters): Promise<Area[]> {
    let result = this.areas.filter((a) => !a.deletedAt);

    if (filters?.ownerUserId) {
      result = result.filter((a) => a.ownerUserId === filters.ownerUserId);
    }
    if (filters?.status) {
      result = result.filter((a) => a.status.toString() === filters.status?.toString());
    }
    if (filters?.biome) {
      result = result.filter((a) => a.biome?.toString() === filters.biome?.toString());
    }
    return result;
  }

  async findById(id: string): Promise<Area | null> {
    return this.areas.find((a) => a.id === id) || null;
  }
}

function createArea(overrides: Partial<{
  id: string;
  ownerUserId: string;
  name: string;
  status: AreaStatus;
  biome: Biome;
}> = {}): Area {
  return new Area({
    id: overrides.id || 'area-1',
    ownerUserId: overrides.ownerUserId || 'user-1',
    name: overrides.name || 'Test Area',
    location: new Location(-15.7939, -47.8828),
    status: overrides.status || AreaStatus.ACTIVE,
    biome: overrides.biome || new Biome('cerrado'),
    carbonCapacity: new CarbonCapacity(100, 0),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('Authorization - Area Domain Entity', () => {
  let area: Area;

  beforeEach(() => {
    area = new Area({
      id: 'area-1',
      ownerUserId: 'owner-user',
      name: 'Owner Area',
      location: new Location(-15.7939, -47.8828),
      status: AreaStatus.DRAFT,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  test('owner can edit draft area', () => {
    expect(area.canBeEditedBy('owner-user')).toBe(true);
  });

  test('non-owner cannot edit area', () => {
    expect(area.canBeEditedBy('other-user')).toBe(false);
  });

  test('owner can delete draft area', () => {
    expect(area.canBeDeletedBy('owner-user')).toBe(true);
  });

  test('non-owner cannot delete area', () => {
    expect(area.canBeDeletedBy('other-user')).toBe(false);
  });

  test('owner can edit active area', () => {
    const activeArea = new Area({
      id: 'area-2',
      ownerUserId: 'owner-user',
      name: 'Active Area',
      location: new Location(-15.7939, -47.8828),
      status: AreaStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(activeArea.canBeEditedBy('owner-user')).toBe(true);
  });

  test('admin can edit active area', () => {
    const activeArea = new Area({
      id: 'area-2',
      ownerUserId: 'owner-user',
      name: 'Active Area',
      location: new Location(-15.7939, -47.8828),
      status: AreaStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(activeArea.canBeEditedBy('other-user', true)).toBe(true);
  });

  test('owner can delete active area', () => {
    const activeArea = new Area({
      id: 'area-2',
      ownerUserId: 'owner-user',
      name: 'Active Area',
      location: new Location(-15.7939, -47.8828),
      status: AreaStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(activeArea.canBeDeletedBy('owner-user')).toBe(true);
  });
});

describe('Authorization - listAreas Use Case', () => {
  let repo: MockAreaRepository;

  beforeEach(() => {
    repo = new MockAreaRepository();

    repo.addArea(createArea({ id: 'area-1', ownerUserId: 'producer-1', name: 'Producer 1 Area A' }));
    repo.addArea(createArea({ id: 'area-2', ownerUserId: 'producer-1', name: 'Producer 1 Area B' }));
    repo.addArea(createArea({ id: 'area-3', ownerUserId: 'producer-2', name: 'Producer 2 Area A' }));
    repo.addArea(createArea({ id: 'area-4', ownerUserId: 'producer-2', name: 'Producer 2 Area B' }));
  });

  test('administrator sees all areas', async () => {
    const result = await listAreas(
      { areaRepository: repo as unknown as AreaRepository },
      { userId: 'admin-user', roles: ['administrator'] }
    );
    expect(result.length).toBe(4);
  });

  test('analyst sees all areas', async () => {
    const result = await listAreas(
      { areaRepository: repo as unknown as AreaRepository },
      { userId: 'analyst-user', roles: ['analyst'] }
    );
    expect(result.length).toBe(4);
  });

  test('producer sees only own areas', async () => {
    const result = await listAreas(
      { areaRepository: repo as unknown as AreaRepository },
      { userId: 'producer-1', roles: ['producer'] }
    );
    expect(result.length).toBe(2);
    expect(result.every((a) => a.ownerUserId === 'producer-1')).toBe(true);
  });

  test('individual sees only own areas', async () => {
    const result = await listAreas(
      { areaRepository: repo as unknown as AreaRepository },
      { userId: 'individual-user', roles: ['individual'] }
    );
    expect(result.length).toBe(0);
  });

  test('legal_entity sees only own areas', async () => {
    const result = await listAreas(
      { areaRepository: repo as unknown as AreaRepository },
      { userId: 'legal-entity-user', roles: ['legal_entity'] }
    );
    expect(result.length).toBe(0);
  });

  test('producer-2 sees only their areas', async () => {
    const result = await listAreas(
      { areaRepository: repo as unknown as AreaRepository },
      { userId: 'producer-2', roles: ['producer'] }
    );
    expect(result.length).toBe(2);
    expect(result.every((a) => a.ownerUserId === 'producer-2')).toBe(true);
  });

  test('admin with explicit ownerUserId filter works', async () => {
    const result = await listAreas(
      { areaRepository: repo as unknown as AreaRepository },
      { userId: 'admin-user', roles: ['administrator'], ownerUserId: 'producer-1' }
    );
    expect(result.length).toBe(2);
  });
});

describe('Authorization - withAuth middleware (unit)', () => {
  const SECRET = env.jwtSecret;
  const now = Math.floor(Date.now() / 1000);

  async function makeToken(roles: string[], userId: string = 'user-1') {
    return signJwt(
      { sub: userId, roles, iss: env.jwtIssuer, aud: env.jwtAudience, iat: now, exp: now + 300 },
      SECRET
    );
  }

  function makeCtx(token?: string): any {
    return {
      request: {
        url: 'http://localhost/api/v1/test',
        headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
        method: 'GET',
      },
      params: {},
      auth: undefined,
    };
  }

  const successHandler = async (_ctx: any) => new Response(JSON.stringify({ ok: true }), { status: 200 });

  test('reject request without token (401)', async () => {
    const handler = withAuth(successHandler);
    const ctx = makeCtx();
    const response = await handler(ctx);
    expect(response.status).toBe(401);
  });

  test('reject request with invalid token (401)', async () => {
    const handler = withAuth(successHandler);
    const ctx = makeCtx('invalid-token');
    const response = await handler(ctx);
    expect(response.status).toBe(401);
  });

  test('reject request with wrong issuer or audience (401)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(
      {
        sub: 'user-1',
        roles: ['individual'],
        iss: 'wrong-issuer',
        aud: 'wrong-audience',
        iat: now,
        exp: now + 300
      },
      SECRET
    );
    const handler = withAuth(async () => new Response('ok', { status: 200 }));

    const response = await handler(makeCtx(token));

    expect(response.status).toBe(401);
  });

  test('allow request with valid token', async () => {
const token = await makeToken(['individual']);
    const handler = withAuth(successHandler);
    const ctx = makeCtx(token);
    const response = await handler(ctx);
    expect(response.status).toBe(200);
  });

  test('reject request with wrong role (403)', async () => {
const token = await makeToken(['individual']);
    const handler = withAuth(successHandler, { roles: ['administrator'] });
    const ctx = makeCtx(token);
    const response = await handler(ctx);
    expect(response.status).toBe(403);
  });

  test('allow admin to access admin route', async () => {
const token = await makeToken(['administrator']);
    const handler = withAuth(successHandler, { roles: ['administrator'] });
    const ctx = makeCtx(token);
    const response = await handler(ctx);
    expect(response.status).toBe(200);
  });

  test('allow analyst to access analyst/admin route', async () => {
const token = await makeToken(['analyst']);
    const handler = withAuth(successHandler, { roles: ['analyst', 'administrator'] });
    const ctx = makeCtx(token);
    const response = await handler(ctx);
    expect(response.status).toBe(200);
  });

  test('reject producer from analyst route (403)', async () => {
const token = await makeToken(['producer']);
    const handler = withAuth(successHandler, { roles: ['analyst', 'administrator'] });
    const ctx = makeCtx(token);
    const response = await handler(ctx);
    expect(response.status).toBe(403);
  });

  test('reject individual from producer route (403)', async () => {
const token = await makeToken(['individual']);
    const handler = withAuth(successHandler, { roles: ['producer', 'administrator'] });
    const ctx = makeCtx(token);
    const response = await handler(ctx);
    expect(response.status).toBe(403);
  });

  test('allow request with no role restriction', async () => {
const token = await makeToken(['individual']);
    const handler = withAuth(successHandler);
    const ctx = makeCtx(token);
    const response = await handler(ctx);
    expect(response.status).toBe(200);
  });
});
