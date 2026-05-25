import { describe, expect, test } from "bun:test";
import type {
  CertificateFileRecord,
  CompensationCertificateRecord,
  CompensationCertificateRepository,
} from "../src/domain/compensations/repositories/compensation-certificate-repository";
import type { CompensationCertificateStorage } from "../src/domain/compensations/services/certificate-storage";
import { issueCompensationCertificate } from "../src/application/compensations/issue-compensation-certificate";
import { SimpleCertificatePdfGenerator } from "../src/infrastructure/pdf/simple-certificate-pdf-generator";

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

describe("issueCompensationCertificate", () => {
  test("generates PDF and persists file/certificate metadata", async () => {
    const repository = new InMemoryCompensationCertificateRepository();
    const storage = new InMemoryCompensationCertificateStorage();
    const generator = new SimpleCertificatePdfGenerator();
    let idSequence = 0;

    const result = await issueCompensationCertificate(
      {
        repository,
        storage,
        pdfGenerator: generator,
        idGenerator: {
          generate: () => ["cert-1", "file-1"][idSequence++] ?? "fallback-id",
        },
        clock: {
          now: () => new Date("2026-02-07T18:00:00Z"),
        },
        auditLog: {
          async log() {},
        },
      },
      {
        compensationId: "comp-123",
        supporterUserId: "supporter-1",
        areaId: "area-1",
        calculationId: "calc-1",
        totalTCO2e: 2.5,
        treesCount: 120,
        totalAmount: 300,
        currency: "BRL",
      },
    );

    expect(result.certificateId).toBe("cert-1");
    expect(result.fileId).toBe("file-1");
    expect(result.fileName).toContain("CBNC-20260207-");
    expect(result.mimeType).toBe("application/pdf");
    expect(result.fileSizeBytes).toBeGreaterThan(50);

    expect(repository.files.length).toBe(1);
    expect(repository.certificates.length).toBe(1);
    expect(repository.files[0].storageUrl).toBe(result.storagePath);
    expect(repository.certificates[0].certificateNumber).toBe(
      result.certificateNumber,
    );

    const savedBytes = await storage.read(result.storagePath);
    const preview = new TextDecoder().decode(savedBytes);
    expect(preview.startsWith("%PDF-1.4")).toBe(true);
    expect(preview).toContain("Tree Planting Contribution Certificate");
    expect(preview).toContain("Estimated Offset Supported");
  });

  test("rejects invalid input values", async () => {
    const repository = new InMemoryCompensationCertificateRepository();
    const storage = new InMemoryCompensationCertificateStorage();
    const generator = new SimpleCertificatePdfGenerator();

    await expect(
      issueCompensationCertificate(
        {
          repository,
          storage,
          pdfGenerator: generator,
          idGenerator: {
            generate: () => "id",
          },
          clock: {
            now: () => new Date("2026-02-07T18:00:00Z"),
          },
          auditLog: {
            async log() {},
          },
        },
        {
          compensationId: "comp-123",
          supporterUserId: "supporter-1",
          areaId: "area-1",
          totalTCO2e: 0,
          treesCount: 0,
          totalAmount: 0,
          currency: "B",
        },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
