import { describe, expect, test } from "bun:test";
import { createCertificateHandlers } from "../src/infrastructure/http/certificate-handlers";
import type {
  CertificateFileRecord,
  CompensationCertificateListItem,
  CompensationCertificateLookup,
  CompensationCertificateRecord,
  CompensationCertificateRepository,
} from "../src/domain/compensations/repositories/compensation-certificate-repository";
import type { CompensationCertificateStorage } from "../src/domain/compensations/services/certificate-storage";
import type { HttpContext } from "../src/shared/http/router";

class InMemoryCertificateRepository implements CompensationCertificateRepository {
  constructor(private readonly certificate: CompensationCertificateLookup) {}

  async createFile(_record: CertificateFileRecord): Promise<void> {}

  async createCertificate(
    _record: CompensationCertificateRecord,
  ): Promise<void> {}

  async findByCertificateNumber(
    certificateNumber: string,
  ): Promise<CompensationCertificateLookup | null> {
    if (certificateNumber !== this.certificate.certificateNumber) {
      return null;
    }
    return this.certificate;
  }

  async findById(
    certificateId: string,
  ): Promise<CompensationCertificateLookup | null> {
    if (certificateId !== this.certificate.id) {
      return null;
    }
    return this.certificate;
  }

  async listBySupporterUserId(params: {
    supporterUserId: string;
    status?: "issued" | "revoked";
    limit: number;
    offset: number;
  }): Promise<CompensationCertificateListItem[]> {
    if (params.supporterUserId !== this.certificate.supporterUserId) {
      return [];
    }
    if (params.status && params.status !== this.certificate.status) {
      return [];
    }

    return [
      {
        id: this.certificate.id,
        compensationId: this.certificate.compensationId,
        certificateNumber: this.certificate.certificateNumber,
        issuedAt: this.certificate.issuedAt,
        status: this.certificate.status,
        authenticityHash: this.certificate.authenticityHash,
        validationUrl: this.certificate.validationUrl,
        qrCodeData: this.certificate.qrCodeData,
        fileName: this.certificate.fileName,
        mimeType: this.certificate.mimeType,
      },
    ].slice(params.offset, params.offset + params.limit);
  }
}

class InMemoryCertificateStorage implements CompensationCertificateStorage {
  private readonly files = new Map<string, Uint8Array>();

  constructor(storagePath: string, content: Uint8Array) {
    this.files.set(storagePath, content);
  }

  async save(params: {
    certificateId: string;
    bytes: Uint8Array;
  }): Promise<{ storagePath: string }> {
    const storagePath = `memory://certs/${params.certificateId}.pdf`;
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

function buildContext(params: {
  path: string;
  userId?: string;
  roles?: string[];
}): HttpContext {
  return {
    request: new Request(`http://localhost${params.path}`),
    params: {},
    query: new URL(`http://localhost${params.path}`).searchParams,
    requestId: "req-1",
    clientIp: "127.0.0.1",
    auth: params.userId
      ? {
          userId: params.userId,
          roles: params.roles ?? ["individual"],
        }
      : undefined,
  };
}

describe("certificate endpoints", () => {
  const certificate: CompensationCertificateLookup = {
    id: "cert-1",
    compensationId: "comp-1",
    certificateNumber: "CBNC-20260207-TEST0001",
    fileId: "file-1",
    issuedAt: new Date("2026-02-07T18:00:00Z"),
    authenticityHash: "abc123",
    validationUrl:
      "/api/v1/certificates/validate?certificate_number=CBNC-20260207-TEST0001&hash=abc123",
    qrCodeData:
      "/api/v1/certificates/validate?certificate_number=CBNC-20260207-TEST0001&hash=abc123",
    status: "issued",
    supporterUserId: "supporter-1",
    fileName: "certificate.pdf",
    mimeType: "application/pdf",
    storageUrl: "memory://certs/file-1.pdf",
  };

  test("validates certificate hash", async () => {
    const handlers = createCertificateHandlers({
      compensationCertificateRepository: new InMemoryCertificateRepository(
        certificate,
      ),
      compensationCertificateStorage: new InMemoryCertificateStorage(
        certificate.storageUrl,
        new TextEncoder().encode("%PDF-1.4\n%%EOF\n"),
      ),
    });

    const response = await handlers.validate(
      buildContext({
        path: `/api/v1/certificates/validate?certificate_number=${certificate.certificateNumber}&hash=${certificate.authenticityHash}`,
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.is_valid).toBe(true);
    expect(payload.data.certificate_id).toBe("cert-1");
  });

  test("returns invalid when hash does not match", async () => {
    const handlers = createCertificateHandlers({
      compensationCertificateRepository: new InMemoryCertificateRepository(
        certificate,
      ),
      compensationCertificateStorage: new InMemoryCertificateStorage(
        certificate.storageUrl,
        new TextEncoder().encode("%PDF-1.4\n%%EOF\n"),
      ),
    });

    const response = await handlers.validate(
      buildContext({
        path: `/api/v1/certificates/validate?certificate_number=${certificate.certificateNumber}&hash=wrong`,
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.is_valid).toBe(false);
  });

  test("downloads certificate for owner", async () => {
    const handlers = createCertificateHandlers({
      compensationCertificateRepository: new InMemoryCertificateRepository(
        certificate,
      ),
      compensationCertificateStorage: new InMemoryCertificateStorage(
        certificate.storageUrl,
        new TextEncoder().encode("%PDF-1.4\n%%EOF\n"),
      ),
    });

    const response = await handlers.download(
      buildContext({
        path: "/api/v1/certificates/cert-1/download",
        userId: "supporter-1",
        roles: ["individual"],
      }),
      "cert-1",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });

  test("denies certificate download for another user", async () => {
    const handlers = createCertificateHandlers({
      compensationCertificateRepository: new InMemoryCertificateRepository(
        certificate,
      ),
      compensationCertificateStorage: new InMemoryCertificateStorage(
        certificate.storageUrl,
        new TextEncoder().encode("%PDF-1.4\n%%EOF\n"),
      ),
    });

    const response = await handlers.download(
      buildContext({
        path: "/api/v1/certificates/cert-1/download",
        userId: "other-user",
        roles: ["individual"],
      }),
      "cert-1",
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error.message_key).toBe("auth.forbidden");
  });

  test("lists certificates by user", async () => {
    const handlers = createCertificateHandlers({
      users: { findBySlug: async (slug: string) => ({ id: slug }) } as any,
      compensationCertificateRepository: new InMemoryCertificateRepository(
        certificate,
      ),
      compensationCertificateStorage: new InMemoryCertificateStorage(
        certificate.storageUrl,
        new TextEncoder().encode("%PDF-1.4\n%%EOF\n"),
      ),
    });

    const response = await handlers.listByUser(
      buildContext({
        path: "/api/v1/users/supporter-1/certificates?limit=10&offset=0",
        userId: "supporter-1",
        roles: ["individual"],
      }),
      "supporter-1",
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data[0].certificateNumber).toBe(
      certificate.certificateNumber,
    );
  });
});
