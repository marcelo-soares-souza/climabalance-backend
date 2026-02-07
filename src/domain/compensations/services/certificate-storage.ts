export interface CompensationCertificateStorage {
  save(params: {
    certificateId: string;
    bytes: Uint8Array;
  }): Promise<{ storagePath: string }>;
  read(storagePath: string): Promise<Uint8Array>;
}
