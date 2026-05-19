import type { CompensationCertificateRepository } from "../../domain/compensations/repositories/compensation-certificate-repository";
import type { CompensationCertificatePdfGenerator } from "../../domain/compensations/services/certificate-pdf-generator";
import type { CompensationCertificateStorage } from "../../domain/compensations/services/certificate-storage";
import { ValidationError } from "../../domain/errors";

export type IssueCompensationCertificateInput = {
  compensationId: string;
  supporterUserId: string;
  areaId: string;
  calculationId?: string;
  compensationMode?: "tco2e" | "tree_purchase";
  horizonYears?: number;
  treesRequested?: number;
  pricePerTree?: number;
  estimatedTotalTCO2e?: number;
  totalTCO2e: number;
  treesCount: number;
  totalAmount: number;
  currency: string;
};

export type IssueCompensationCertificateResult = {
  certificateId: string;
  certificateNumber: string;
  authenticityHash: string;
  validationUrl: string;
  qrCodeData: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
  fileSizeBytes: number;
  issuedAt: Date;
};

export async function issueCompensationCertificate(
  deps: {
    repository: CompensationCertificateRepository;
    pdfGenerator: CompensationCertificatePdfGenerator;
    storage: CompensationCertificateStorage;
    idGenerator: { generate(): string };
    clock: { now(): Date };
    auditLog: {
      log(entry: {
        actorUserId: string;
        action: string;
        entityType: string;
        entityId: string;
        metadata?: Record<string, any>;
      }): Promise<void>;
    };
  },
  input: IssueCompensationCertificateInput,
): Promise<IssueCompensationCertificateResult> {
  validateInput(input);

  const issuedAt = deps.clock.now();
  const certificateId = deps.idGenerator.generate();
  const fileId = deps.idGenerator.generate();
  const certificateNumber = buildCertificateNumber(
    input.compensationId,
    issuedAt,
  );
  const authenticityHash = await createAuthenticityHash({
    certificateNumber,
    issuedAt,
    compensationId: input.compensationId,
    supporterUserId: input.supporterUserId,
    areaId: input.areaId,
    totalTCO2e: input.totalTCO2e,
    treesCount: input.treesCount,
    totalAmount: input.totalAmount,
    currency: input.currency,
    mode: input.compensationMode ?? "tco2e",
  });
  const validationUrl = buildValidationUrl(certificateNumber, authenticityHash);
  const qrCodeData = validationUrl;
  const fileName = `${certificateNumber}.pdf`;
  const mimeType = "application/pdf";

  const pdfBytes = await deps.pdfGenerator.generate({
    certificateNumber,
    issuedAt,
    compensationId: input.compensationId,
    supporterUserId: input.supporterUserId,
    areaId: input.areaId,
    calculationId: input.calculationId,
    compensationMode: input.compensationMode,
    horizonYears: input.horizonYears,
    treesRequested: input.treesRequested,
    pricePerTree: input.pricePerTree,
    estimatedTotalTCO2e: input.estimatedTotalTCO2e,
    // Embed authenticity metadata inside PDF payload.
    authenticityHash,
    validationUrl,
    qrCodeData,
    totalTCO2e: input.totalTCO2e,
    treesCount: input.treesCount,
    totalAmount: input.totalAmount,
    currency: input.currency,
  });

  if (pdfBytes.byteLength === 0) {
    throw new ValidationError([
      {
        field: "certificate",
        message: "empty_pdf",
      },
    ]);
  }

  const storage = await deps.storage.save({
    certificateId,
    bytes: pdfBytes,
  });

  await deps.repository.createFile({
    id: fileId,
    ownerUserId: input.supporterUserId,
    fileType: "certificate_pdf",
    fileName,
    mimeType,
    storageUrl: storage.storagePath,
    checksum: null,
    sizeBytes: pdfBytes.byteLength,
    createdAt: issuedAt,
    updatedAt: issuedAt,
    deletedAt: null,
  });

  await deps.repository.createCertificate({
    id: certificateId,
    compensationId: input.compensationId,
    certificateNumber,
    fileId,
    issuedAt,
    authenticityHash,
    validationUrl,
    qrCodeData,
    status: "issued",
    createdAt: issuedAt,
    updatedAt: issuedAt,
    deletedAt: null,
  });

  await deps.auditLog.log({
    actorUserId: input.supporterUserId,
    action: "compensation.certificate_issued",
    entityType: "certificate",
    entityId: certificateId,
    metadata: {
      compensation_id: input.compensationId,
      file_id: fileId,
      certificate_number: certificateNumber,
      authenticity_hash: authenticityHash,
      validation_url: validationUrl,
      storage_path: storage.storagePath,
      file_size_bytes: pdfBytes.byteLength,
    },
  });

  return {
    certificateId,
    certificateNumber,
    authenticityHash,
    validationUrl,
    qrCodeData,
    fileId,
    fileName,
    mimeType,
    storagePath: storage.storagePath,
    fileSizeBytes: pdfBytes.byteLength,
    issuedAt,
  };
}

function buildCertificateNumber(
  compensationId: string,
  issuedAt: Date,
): string {
  const year = String(issuedAt.getUTCFullYear());
  const month = String(issuedAt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(issuedAt.getUTCDate()).padStart(2, "0");
  const normalizedCompensationId = compensationId
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  const suffix = normalizedCompensationId.slice(-8).padStart(8, "0");

  return `CBNC-${year}${month}${day}-${suffix}`;
}

function validateInput(input: IssueCompensationCertificateInput): void {
  const errors: Array<{ field: string; message: string }> = [];

  if (!input.compensationId || !input.compensationId.trim()) {
    errors.push({ field: "compensation_id", message: "required" });
  }
  if (!input.supporterUserId || !input.supporterUserId.trim()) {
    errors.push({ field: "supporter_user_id", message: "required" });
  }
  if (!input.areaId || !input.areaId.trim()) {
    errors.push({ field: "area_id", message: "required" });
  }
  if (input.totalTCO2e <= 0) {
    errors.push({ field: "total_t_co2e", message: "must_be_positive" });
  }
  if (input.treesCount <= 0) {
    errors.push({ field: "trees_count", message: "must_be_positive" });
  }
  if (input.totalAmount <= 0) {
    errors.push({ field: "total_amount", message: "must_be_positive" });
  }
  if (!input.currency || input.currency.trim().length !== 3) {
    errors.push({ field: "currency", message: "must_be_iso_4217" });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}

async function createAuthenticityHash(params: {
  certificateNumber: string;
  issuedAt: Date;
  compensationId: string;
  supporterUserId: string;
  areaId: string;
  totalTCO2e: number;
  treesCount: number;
  totalAmount: number;
  currency: string;
  mode: string;
}): Promise<string> {
  const payload = [
    params.certificateNumber,
    params.issuedAt.toISOString(),
    params.compensationId,
    params.supporterUserId,
    params.areaId,
    params.totalTCO2e.toFixed(6),
    params.treesCount.toString(),
    params.totalAmount.toFixed(2),
    params.currency.toUpperCase(),
    params.mode,
  ].join("|");

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return Buffer.from(digest).toString("hex");
}

function buildValidationUrl(
  certificateNumber: string,
  authenticityHash: string,
): string {
  const encodedNumber = encodeURIComponent(certificateNumber);
  const encodedHash = encodeURIComponent(authenticityHash);
  return `/api/v1/certificates/validate?certificate_number=${encodedNumber}&hash=${encodedHash}`;
}
