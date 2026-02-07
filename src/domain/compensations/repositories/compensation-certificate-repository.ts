export type CertificateFileRecord = {
  id: string;
  ownerUserId: string;
  fileType: string;
  fileName: string;
  mimeType: string;
  storageUrl: string;
  checksum?: string | null;
  sizeBytes: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export type CompensationCertificateRecord = {
  id: string;
  compensationId: string;
  certificateNumber: string;
  fileId: string;
  issuedAt: Date;
  authenticityHash?: string;
  validationUrl?: string;
  qrCodeData?: string;
  status: 'issued' | 'revoked';
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export type CompensationCertificateLookup = {
  id: string;
  compensationId: string;
  certificateNumber: string;
  fileId: string;
  issuedAt: Date | null;
  authenticityHash?: string | null;
  validationUrl?: string | null;
  qrCodeData?: string | null;
  status: 'issued' | 'revoked';
  supporterUserId: string;
  fileName: string;
  mimeType: string;
  storageUrl: string;
};

export type CompensationCertificateListItem = {
  id: string;
  compensationId: string;
  certificateNumber: string;
  issuedAt: Date | null;
  status: 'issued' | 'revoked';
  authenticityHash?: string | null;
  validationUrl?: string | null;
  qrCodeData?: string | null;
  fileName: string;
  mimeType: string;
};

export interface CompensationCertificateRepository {
  createFile(record: CertificateFileRecord, client?: any): Promise<void>;
  createCertificate(
    record: CompensationCertificateRecord,
    client?: any
  ): Promise<void>;
  findByCertificateNumber(
    certificateNumber: string,
    client?: any
  ): Promise<CompensationCertificateLookup | null>;
  findById(
    certificateId: string,
    client?: any
  ): Promise<CompensationCertificateLookup | null>;
  listBySupporterUserId(
    params: {
      supporterUserId: string;
      status?: 'issued' | 'revoked';
      limit: number;
      offset: number;
    },
    client?: any
  ): Promise<CompensationCertificateListItem[]>;
}
