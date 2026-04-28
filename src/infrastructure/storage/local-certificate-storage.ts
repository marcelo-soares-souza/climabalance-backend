import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CompensationCertificateStorage } from '../../domain/compensations/services/certificate-storage';
import { env } from '../../shared/utils/env';

export class LocalCertificateStorage implements CompensationCertificateStorage {
  constructor(private readonly basePath: string = env.certificateStoragePath) {}

  async save(params: {
    certificateId: string;
    bytes: Uint8Array;
  }): Promise<{ storagePath: string }> {
    await mkdir(this.basePath, { recursive: true });
    const fileName = `${params.certificateId}.pdf`;
    const fullPath = path.join(this.basePath, fileName);
    await writeFile(fullPath, params.bytes);
    return { storagePath: fullPath };
  }

  async read(storagePath: string): Promise<Uint8Array> {
    const content = await readFile(storagePath);
    return new Uint8Array(content);
  }
}
