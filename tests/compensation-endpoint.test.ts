import { describe, expect, test } from "bun:test";
import { createCompensationHandlers } from "../src/infrastructure/http/compensation-handlers";
import type {
  CompensationAtomicStore,
  CompensationAtomicTransaction,
  CompensationAreaSnapshot,
  CompensationCreateRecord,
} from "../src/application/compensations/create-compensation-atomic";
import type {
  CertificateFileRecord,
  CompensationCertificateRecord,
  CompensationCertificateRepository,
} from "../src/domain/compensations/repositories/compensation-certificate-repository";
import type { CompensationHistoryRepository } from "../src/domain/compensations/repositories/compensation-history-repository";
import type {
  AreaContributionItem,
  CompensationHistoryItem,
} from "../src/domain/compensations/repositories/compensation-history-repository";
import type { CompensationCertificateStorage } from "../src/domain/compensations/services/certificate-storage";
import type { CompensationCertificatePdfGenerator } from "../src/domain/compensations/services/certificate-pdf-generator";
import type { HttpContext } from "../src/shared/http/router";
import { Area } from "../src/domain/areas/entities/area";
import { AreaStatus } from "../src/domain/areas/value-objects/area-status";
import { Location } from "../src/domain/areas/value-objects/location";

class InMemoryCompensationStore implements CompensationAtomicStore {
  constructor(private area: CompensationAreaSnapshot) {}

  async runInTransaction<T>(
    work: (tx: CompensationAtomicTransaction) => Promise<T>,
  ): Promise<T> {
    const tx: CompensationAtomicTransaction = {
      lockArea: async (areaId: string) => {
        if (this.area.id !== areaId) {
          return null;
        }
        return { ...this.area };
      },
      insertCompensation: async (_record: CompensationCreateRecord) => {},
      sumPaidTreeCountByArea: async (_areaId: string) => 0,
      sumCommittedTreeCountByArea: async (_areaId: string) => 0,
    };
    return work(tx);
  }
}

class InMemoryCompensationHistoryRepository implements CompensationHistoryRepository {
  constructor(
    private readonly items: CompensationHistoryItem[] = [],
    private readonly areaContributions: Array<
      AreaContributionItem & { areaId: string }
    > = [],
  ) {}

  async listBySupporter(input: {
    supporterUserId: string;
    status?: CompensationHistoryItem["status"];
    limit: number;
    offset: number;
  }): Promise<CompensationHistoryItem[]> {
    const filtered = this.items.filter(
      (item) =>
        item.supporterUserId === input.supporterUserId &&
        (input.status == null || item.status === input.status),
    );
    return filtered.slice(input.offset, input.offset + input.limit);
  }

  async listPaidTreePurchaseByArea(input: {
    areaId: string;
    limit: number;
    offset: number;
  }): Promise<AreaContributionItem[]> {
    return this.areaContributions
      .filter((item) => item.areaId === input.areaId)
      .slice(input.offset, input.offset + input.limit);
  }

  async sumPaidTreeCountByArea(_areaId: string): Promise<number> {
    return 0;
  }

  async sumCommittedTreeCountByArea(_areaId: string): Promise<number> {
    return 0;
  }

  async findById(
    _compensationId: string,
  ): Promise<CompensationHistoryItem | null> {
    return this.items.find((item) => item.id === _compensationId) ?? null;
  }
}

class InMemoryCompensationCertificateRepository implements CompensationCertificateRepository {
  files: CertificateFileRecord[] = [];
  certificates: CompensationCertificateRecord[] = [];

  async createFile(record: CertificateFileRecord): Promise<void> {
    this.files.push(record);
  }

  async createCertificate(
    record: CompensationCertificateRecord,
  ): Promise<void> {
    this.certificates.push(record);
  }

  async findByCertificateNumber(): Promise<null> {
    return null;
  }

  async findById(): Promise<null> {
    return null;
  }

  async listBySupporterUserId(): Promise<[]> {
    return [];
  }
}

class InMemoryCompensationCertificateStorage implements CompensationCertificateStorage {
  files = new Map<string, Uint8Array>();

  async save(params: {
    certificateId: string;
    bytes: Uint8Array;
  }): Promise<{ storagePath: string }> {
    const storagePath = `memory://certificates/${params.certificateId}.pdf`;
    this.files.set(storagePath, params.bytes);
    return { storagePath };
  }

  async read(storagePath: string): Promise<Uint8Array> {
    const bytes = this.files.get(storagePath);
    if (!bytes) {
      throw new Error("file_not_found");
    }
    return bytes;
  }
}

class InMemoryCompensationCertificatePdfGenerator implements CompensationCertificatePdfGenerator {
  async generate(): Promise<Uint8Array> {
    return new TextEncoder().encode("%PDF-1.4\n%%EOF\n");
  }
}

function createMockUsers(
  countryCode = "US",
  addressCountry?: string,
) {
  return {
    findBySlug: async (slug: string) => ({ id: slug }) as any,
    getProfile: async (_userId: string) => ({
      countryCode,
      addressCountry: addressCountry ?? countryCode,
    }),
  } as any;
}

const mockUsers = createMockUsers("US");

class InMemoryAreaRepository {
  constructor(private readonly area: Area) {}

  async findById(id: string): Promise<Area | null> {
    if (id !== this.area.id) {
      return null;
    }
    return this.area;
  }

  async findBySlug(slug: string): Promise<Area | null> {
    if (slug === this.area.id || slug === this.area.slug) return this.area;
    return null;
  }
}

function buildContext(body: Record<string, unknown>): HttpContext {
  return {
    request: new Request("http://localhost/api/v1/compensations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    params: {},
    query: new URL("http://localhost/api/v1/compensations").searchParams,
    requestId: "req-1",
    clientIp: "127.0.0.1",
    auth: {
      userId: "supporter-1",
      roles: ["individual"],
    },
  };
}

function buildPostContext(
  path: string,
  body: Record<string, unknown>,
  userId = "supporter-1",
  roles: string[] = ["individual"],
): HttpContext {
  return {
    request: new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    params: {},
    query: new URL(`http://localhost${path}`).searchParams,
    requestId: "req-1",
    clientIp: "127.0.0.1",
    auth: {
      userId,
      roles,
    },
  };
}

function buildGetContext(
  path: string,
  userId = "supporter-1",
  roles: string[] = ["individual"],
): HttpContext {
  return {
    request: new Request(`http://localhost${path}`, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    }),
    params: {},
    query: new URL(`http://localhost${path}`).searchParams,
    requestId: "req-1",
    clientIp: "127.0.0.1",
    auth: {
      userId,
      roles,
    },
  };
}

describe("POST /api/v1/compensations handler", () => {
  const activeArea = new Area({
    id: "area-1",
    ownerUserId: "producer-1",
    name: "Area 1",
    location: new Location(-15.7939, -47.8828),
    status: AreaStatus.ACTIVE,
    tCO2ePerTreePerYear: 0.00075,
    pricePerTree: 12,
    defaultHorizonYears: 20,
    maxPurchasableTrees: null,
    createdAt: new Date("2026-02-07T12:00:00Z"),
    updatedAt: new Date("2026-02-07T12:00:00Z"),
  });

  test("returns 201 with compensation payload", async () => {
    const certificateRepository =
      new InMemoryCompensationCertificateRepository();
    let idSequence = 0;
    const handlers = createCompensationHandlers({
      users: mockUsers,
      areaRepository: new InMemoryAreaRepository(activeArea) as any,
      compensationStore: new InMemoryCompensationStore({
        id: "area-1",
        status: "active",
        maxPurchasableTrees: null,
      }),
      compensationHistoryRepository:
        new InMemoryCompensationHistoryRepository(),
      compensationCertificateRepository: certificateRepository,
      compensationCertificateStorage:
        new InMemoryCompensationCertificateStorage(),
      compensationCertificatePdfGenerator:
        new InMemoryCompensationCertificatePdfGenerator(),
      idGenerator: {
        generate: () =>
          ["comp-123", "cert-123", "file-123"][idSequence++] ?? "id-fallback",
      },
      clock: {
        now: () => new Date("2026-02-07T16:00:00Z"),
      },
      usdToBrlExchangeRate: 5,
      defaultMaxPurchasableTrees: 1000,
      auditLog: {
        async log() {},
      },
    });

    const response = await handlers.create(
      buildContext({
        area_id: "area-1",
        calculation_id: "calc-1",
        compensation_mode: "tree_purchase",
        trees_requested: 120,
        currency: "brl",
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.message_key).toBe("compensation.created_pending");
    expect(payload.data.compensation_id).toBe("comp-123");
    expect(payload.data.area_id).toBe("area-1");
    expect(payload.data.total_t_co2e).toBeCloseTo(1.8, 6);
    expect(payload.data.trees_count).toBe(120);
    expect(payload.data.total_amount).toBe(1440);
    expect(payload.data.status).toBe("pending");
    expect(payload.data.certificate).toBeNull();
  });

  test("returns 400 when request is invalid", async () => {
    const handlers = createCompensationHandlers({
      users: mockUsers,
      areaRepository: new InMemoryAreaRepository(activeArea) as any,
      compensationStore: new InMemoryCompensationStore({
        id: "area-1",
        status: "active",
        maxPurchasableTrees: null,
      }),
      compensationHistoryRepository:
        new InMemoryCompensationHistoryRepository(),
      compensationCertificateRepository:
        new InMemoryCompensationCertificateRepository(),
      compensationCertificateStorage:
        new InMemoryCompensationCertificateStorage(),
      compensationCertificatePdfGenerator:
        new InMemoryCompensationCertificatePdfGenerator(),
      idGenerator: {
        generate: () => "comp-123",
      },
      clock: {
        now: () => new Date("2026-02-07T16:00:00Z"),
      },
      usdToBrlExchangeRate: 5,
      defaultMaxPurchasableTrees: 100,
      auditLog: {
        async log() {},
      },
    });

    const response = await handlers.create(
      buildContext({
        area_id: "area-1",
        compensation_mode: "tree_purchase",
        currency: "BRL",
      }),
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error.message_key).toBe("request.validation_failed");
  });

  test("lists own compensations", async () => {
    const handlers = createCompensationHandlers({
      users: mockUsers,
      areaRepository: new InMemoryAreaRepository(activeArea) as any,
      compensationStore: new InMemoryCompensationStore({
        id: "area-1",
        status: "active",
        maxPurchasableTrees: null,
      }),
      compensationHistoryRepository: new InMemoryCompensationHistoryRepository([
        {
          id: "comp-1",
          supporterUserId: "supporter-1",
          areaId: "area-1",
          areaName: "Area 1",
          calculationId: "calc-1",
          totalTCO2e: 2.5,
          treesCount: 120,
          totalAmount: 250,
          currency: "BRL",
          status: "pending",
          createdAt: new Date("2026-02-07T16:00:00Z"),
        },
      ]),
      compensationCertificateRepository:
        new InMemoryCompensationCertificateRepository(),
      compensationCertificateStorage:
        new InMemoryCompensationCertificateStorage(),
      compensationCertificatePdfGenerator:
        new InMemoryCompensationCertificatePdfGenerator(),
      idGenerator: {
        generate: () => "comp-123",
      },
      clock: {
        now: () => new Date("2026-02-07T16:00:00Z"),
      },
      usdToBrlExchangeRate: 5,
      defaultMaxPurchasableTrees: 100,
      auditLog: {
        async log() {},
      },
    });

    const response = await handlers.listOwn(
      buildGetContext("/api/v1/compensations"),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0].id).toBe("comp-1");
    expect(payload.data[0].area_name).toBe("Area 1");
    expect(payload.data[0].total_t_co2e).toBe(2.5);
  });

  test("lists compensations by user id for self/admin route", async () => {
    const handlers = createCompensationHandlers({
      users: mockUsers,
      areaRepository: new InMemoryAreaRepository(activeArea) as any,
      compensationStore: new InMemoryCompensationStore({
        id: "area-1",
        status: "active",
        maxPurchasableTrees: null,
      }),
      compensationHistoryRepository: new InMemoryCompensationHistoryRepository([
        {
          id: "comp-2",
          supporterUserId: "supporter-2",
          areaId: "area-9",
          areaName: "Area 9",
          calculationId: null,
          totalTCO2e: 1.1,
          treesCount: 50,
          totalAmount: 110,
          currency: "BRL",
          status: "paid",
          createdAt: new Date("2026-02-07T17:00:00Z"),
        },
      ]),
      compensationCertificateRepository:
        new InMemoryCompensationCertificateRepository(),
      compensationCertificateStorage:
        new InMemoryCompensationCertificateStorage(),
      compensationCertificatePdfGenerator:
        new InMemoryCompensationCertificatePdfGenerator(),
      idGenerator: {
        generate: () => "comp-123",
      },
      clock: {
        now: () => new Date("2026-02-07T16:00:00Z"),
      },
      usdToBrlExchangeRate: 5,
      defaultMaxPurchasableTrees: 100,
      auditLog: {
        async log() {},
      },
    });

    const response = await handlers.listByUser(
      buildGetContext("/api/v1/users/supporter-2/compensations", "admin-1", [
        "administrator",
      ]),
      "supporter-2",
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0].id).toBe("comp-2");
    expect(payload.data[0].status).toBe("paid");
  });

  test("lists paid tree contributions by area without financial amount", async () => {
    const handlers = createCompensationHandlers({
      users: mockUsers,
      areaRepository: new InMemoryAreaRepository(activeArea) as any,
      compensationStore: new InMemoryCompensationStore({
        id: "area-1",
        status: "active",
        maxPurchasableTrees: null,
      }),
      compensationHistoryRepository: new InMemoryCompensationHistoryRepository(
        [],
        [
          {
            compensationId: "comp-tree-paid-1",
            areaId: "area-1",
            supporterUserId: "supporter-3",
            supporterDisplayName: "Maria Souza",
            treesCount: 40,
            totalTCO2e: 0.6,
            compensatedAt: new Date("2026-02-07T17:30:00Z"),
          },
        ],
      ),
      compensationCertificateRepository:
        new InMemoryCompensationCertificateRepository(),
      compensationCertificateStorage:
        new InMemoryCompensationCertificateStorage(),
      compensationCertificatePdfGenerator:
        new InMemoryCompensationCertificatePdfGenerator(),
      idGenerator: {
        generate: () => "comp-123",
      },
      clock: {
        now: () => new Date("2026-02-07T16:00:00Z"),
      },
      usdToBrlExchangeRate: 5,
      defaultMaxPurchasableTrees: 100,
      auditLog: {
        async log() {},
      },
    });

    const response = await handlers.listByArea(
      buildGetContext("/api/v1/areas/area-1/contributions?limit=10&offset=0"),
      "area-1",
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0].compensation_id).toBe("comp-tree-paid-1");
    expect(payload.data[0].supporter_display_name).toBe("Maria Souza");
    expect(payload.data[0].trees_count).toBe(40);
    expect(payload.data[0].total_t_co2e).toBe(0.6);
    expect(payload.data[0].total_amount).toBeUndefined();
  });

  test("quotes tree purchase contribution using project metrics", async () => {
    const handlers = createCompensationHandlers({
      users: mockUsers,
      areaRepository: new InMemoryAreaRepository(activeArea) as any,
      compensationStore: new InMemoryCompensationStore({
        id: "area-1",
        status: "active",
        maxPurchasableTrees: null,
      }),
      compensationHistoryRepository:
        new InMemoryCompensationHistoryRepository(),
      compensationCertificateRepository:
        new InMemoryCompensationCertificateRepository(),
      compensationCertificateStorage:
        new InMemoryCompensationCertificateStorage(),
      compensationCertificatePdfGenerator:
        new InMemoryCompensationCertificatePdfGenerator(),
      idGenerator: {
        generate: () => "comp-123",
      },
      clock: {
        now: () => new Date("2026-02-07T16:00:00Z"),
      },
      usdToBrlExchangeRate: 5,
      defaultMaxPurchasableTrees: 100,
      auditLog: {
        async log() {},
      },
    });

    const response = await handlers.quote(
      buildPostContext("/api/v1/compensations/quote", {
        area_id: "area-1",
        trees_requested: 10,
        currency: "brl",
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.compensation_mode).toBe("tree_purchase");
    expect(payload.data.horizon_years).toBe(20);
    expect(payload.data.trees_requested).toBe(10);
    expect(payload.data.estimated_kg_co2_per_tree_per_year).toBe(0.75);
    expect(payload.data.estimated_total_kg_co2e).toBe(150);
    expect(payload.data.price_per_tree).toBe(12);
    expect(payload.data.total_amount).toBe(120);
  });

  test("creates compensation in tree purchase mode", async () => {
    let idSequence = 0;
    const handlers = createCompensationHandlers({
      users: mockUsers,
      areaRepository: new InMemoryAreaRepository(activeArea) as any,
      compensationStore: new InMemoryCompensationStore({
        id: "area-1",
        status: "active",
        maxPurchasableTrees: null,
      }),
      compensationHistoryRepository:
        new InMemoryCompensationHistoryRepository(),
      compensationCertificateRepository:
        new InMemoryCompensationCertificateRepository(),
      compensationCertificateStorage:
        new InMemoryCompensationCertificateStorage(),
      compensationCertificatePdfGenerator:
        new InMemoryCompensationCertificatePdfGenerator(),
      idGenerator: {
        generate: () =>
          ["comp-tree-1", "cert-tree-1", "file-tree-1"][idSequence++] ??
          "id-fallback",
      },
      clock: {
        now: () => new Date("2026-02-07T16:00:00Z"),
      },
      usdToBrlExchangeRate: 5,
      defaultMaxPurchasableTrees: 100,
      auditLog: {
        async log() {},
      },
    });

    const response = await handlers.create(
      buildContext({
        area_id: "area-1",
        compensation_mode: "tree_purchase",
        trees_requested: 10,
        currency: "BRL",
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.data.compensation_mode).toBe("tree_purchase");
    expect(payload.data.horizon_years).toBe(20);
    expect(payload.data.trees_requested).toBe(10);
    expect(payload.data.price_per_tree).toBe(12);
    expect(payload.data.total_t_co2e).toBeCloseTo(0.15, 6);
    expect(payload.data.trees_count).toBe(10);
    expect(payload.data.total_amount).toBe(120);
  });

  test("quote returns BRL with converted price for Brazilian user", async () => {
    const handlers = createCompensationHandlers({
      users: createMockUsers("BR"),
      areaRepository: new InMemoryAreaRepository(activeArea) as any,
      compensationStore: new InMemoryCompensationStore({
        id: "area-1",
        status: "active",
        maxPurchasableTrees: null,
      }),
      compensationHistoryRepository:
        new InMemoryCompensationHistoryRepository(),
      compensationCertificateRepository:
        new InMemoryCompensationCertificateRepository(),
      compensationCertificateStorage:
        new InMemoryCompensationCertificateStorage(),
      compensationCertificatePdfGenerator:
        new InMemoryCompensationCertificatePdfGenerator(),
      idGenerator: {
        generate: () => "comp-123",
      },
      clock: {
        now: () => new Date("2026-02-07T16:00:00Z"),
      },
      usdToBrlExchangeRate: 5,
      defaultMaxPurchasableTrees: 100,
      auditLog: {
        async log() {},
      },
    });

    const response = await handlers.quote(
      buildPostContext("/api/v1/compensations/quote", {
        area_id: "area-1",
        trees_requested: 10,
        currency: "USD",
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.currency).toBe("BRL");
    expect(payload.data.price_per_tree).toBe(60);
    expect(payload.data.total_amount).toBe(600);
  });

  test("create compensation persists BRL for Brazilian user", async () => {
    let idSequence = 0;
    const handlers = createCompensationHandlers({
      users: createMockUsers("BR"),
      areaRepository: new InMemoryAreaRepository(activeArea) as any,
      compensationStore: new InMemoryCompensationStore({
        id: "area-1",
        status: "active",
        maxPurchasableTrees: null,
      }),
      compensationHistoryRepository:
        new InMemoryCompensationHistoryRepository(),
      compensationCertificateRepository:
        new InMemoryCompensationCertificateRepository(),
      compensationCertificateStorage:
        new InMemoryCompensationCertificateStorage(),
      compensationCertificatePdfGenerator:
        new InMemoryCompensationCertificatePdfGenerator(),
      idGenerator: {
        generate: () =>
          ["comp-tree-br-1", "cert-tree-br-1"][idSequence++] ?? "id-fallback",
      },
      clock: {
        now: () => new Date("2026-02-07T16:00:00Z"),
      },
      usdToBrlExchangeRate: 5,
      defaultMaxPurchasableTrees: 100,
      auditLog: {
        async log() {},
      },
    });

    const response = await handlers.create(
      buildContext({
        area_id: "area-1",
        compensation_mode: "tree_purchase",
        trees_requested: 10,
        currency: "USD",
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.data.currency).toBe("BRL");
    expect(payload.data.price_per_tree).toBe(60);
    expect(payload.data.total_amount).toBe(600);
  });
});
