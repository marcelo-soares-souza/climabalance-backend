import type { CompensationCertificateStorage } from '../../domain/compensations/services/certificate-storage';
import { S3CompatibleObjectStorage } from './s3-compatible-object-storage';

export class S3CertificateStorage implements CompensationCertificateStorage {
  constructor(
    private readonly objectStorage: S3CompatibleObjectStorage,
    private readonly prefix: string = 'certificates'
  ) {}

  async save(params: {
    certificateId: string;
    bytes: Uint8Array;
  }): Promise<{ storagePath: string }> {
    const objectKey = `${this.prefix}/${params.certificateId}.pdf`;
    const storagePath = await this.objectStorage.putObject({
      key: objectKey,
      bytes: params.bytes,
      contentType: 'application/pdf',
    });
    return { storagePath };
  }

  async read(storagePath: string): Promise<Uint8Array> {
    return this.objectStorage.getObject(storagePath);
  }
}
