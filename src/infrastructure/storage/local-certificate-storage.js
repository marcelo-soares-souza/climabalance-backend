import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
export class LocalCertificateStorage {
    basePath;
    constructor(basePath = process.env.CERTIFICATE_STORAGE_PATH ??
        './storage/certificates') {
        this.basePath = basePath;
    }
    async save(params) {
        await mkdir(this.basePath, { recursive: true });
        const fileName = `${params.certificateId}.pdf`;
        const fullPath = path.join(this.basePath, fileName);
        await writeFile(fullPath, params.bytes);
        return { storagePath: fullPath };
    }
    async read(storagePath) {
        const content = await readFile(storagePath);
        return new Uint8Array(content);
    }
}
