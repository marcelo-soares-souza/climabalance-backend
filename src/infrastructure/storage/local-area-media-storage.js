import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
const extensionByMime = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
};
function resolveExtension(mimeType) {
    return extensionByMime[mimeType] ?? 'bin';
}
export class LocalAreaMediaStorage {
    basePath;
    constructor(basePath = process.env.AREA_MEDIA_STORAGE_PATH ?? './storage/area-media') {
        this.basePath = basePath;
    }
    async save(params) {
        await mkdir(this.basePath, { recursive: true });
        const ext = resolveExtension(params.mimeType);
        const fileName = `${params.mediaId}.${ext}`;
        const fullPath = path.join(this.basePath, fileName);
        await writeFile(fullPath, params.bytes);
        return { storagePath: fullPath };
    }
    async read(storagePath) {
        const content = await readFile(storagePath);
        return new Uint8Array(content);
    }
    async delete(storagePath) {
        await rm(storagePath, { force: true });
    }
}
