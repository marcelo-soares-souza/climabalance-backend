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
export class S3AreaMediaStorage {
    objectStorage;
    prefix;
    constructor(objectStorage, prefix = 'area-media') {
        this.objectStorage = objectStorage;
        this.prefix = prefix;
    }
    async save(params) {
        const ext = resolveExtension(params.mimeType);
        const objectKey = `${this.prefix}/${params.mediaId}.${ext}`;
        const storagePath = await this.objectStorage.putObject({
            key: objectKey,
            bytes: params.bytes,
            contentType: params.mimeType,
        });
        return { storagePath };
    }
    async read(storagePath) {
        return this.objectStorage.getObject(storagePath);
    }
    async delete(storagePath) {
        await this.objectStorage.deleteObject(storagePath);
    }
}
