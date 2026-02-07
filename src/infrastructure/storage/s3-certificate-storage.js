export class S3CertificateStorage {
    objectStorage;
    prefix;
    constructor(objectStorage, prefix = 'certificates') {
        this.objectStorage = objectStorage;
        this.prefix = prefix;
    }
    async save(params) {
        const objectKey = `${this.prefix}/${params.certificateId}.pdf`;
        const storagePath = await this.objectStorage.putObject({
            key: objectKey,
            bytes: params.bytes,
            contentType: 'application/pdf',
        });
        return { storagePath };
    }
    async read(storagePath) {
        return this.objectStorage.getObject(storagePath);
    }
}
