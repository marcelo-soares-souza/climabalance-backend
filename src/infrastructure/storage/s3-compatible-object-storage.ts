import { createHash, createHmac } from 'node:crypto';

export type S3CompatibleConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  forcePathStyle?: boolean;
};

type FetchLike = typeof fetch;

export class S3CompatibleObjectStorage {
  private readonly endpoint: URL;
  private readonly forcePathStyle: boolean;

  constructor(
    private readonly config: S3CompatibleConfig,
    private readonly fetchImpl: FetchLike = fetch
  ) {
    this.endpoint = new URL(config.endpoint);
    this.forcePathStyle = config.forcePathStyle ?? true;
  }

  async putObject(params: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
  }): Promise<string> {
    const key = normalizeObjectKey(params.key);
    const payloadHash = sha256Hex(params.bytes);
    const request = this.buildRequest({
      method: 'PUT',
      key,
      payloadHash,
      contentType: params.contentType,
    });

    const response = await this.fetchImpl(request.url, {
      method: 'PUT',
      headers: request.headers,
      body: params.bytes,
    });
    if (!response.ok) {
      throw new Error(`s3.put_failed:${response.status}`);
    }

    return this.toStoragePath(key);
  }

  async getObject(storagePathOrKey: string): Promise<Uint8Array> {
    const key = this.extractObjectKey(storagePathOrKey);
    const request = this.buildRequest({
      method: 'GET',
      key,
      payloadHash: sha256Hex(new Uint8Array()),
    });

    const response = await this.fetchImpl(request.url, {
      method: 'GET',
      headers: request.headers,
    });
    if (!response.ok) {
      throw new Error(`s3.get_failed:${response.status}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  async deleteObject(storagePathOrKey: string): Promise<void> {
    const key = this.extractObjectKey(storagePathOrKey);
    const request = this.buildRequest({
      method: 'DELETE',
      key,
      payloadHash: sha256Hex(new Uint8Array()),
    });

    const response = await this.fetchImpl(request.url, {
      method: 'DELETE',
      headers: request.headers,
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`s3.delete_failed:${response.status}`);
    }
  }

  private buildRequest(input: {
    method: 'PUT' | 'GET' | 'DELETE';
    key: string;
    payloadHash: string;
    contentType?: string;
  }): { url: string; headers: Record<string, string> } {
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const { host, canonicalUri, url } = this.resolveTarget(input.key);

    const canonicalHeaders = new Map<string, string>();
    canonicalHeaders.set('host', host);
    canonicalHeaders.set('x-amz-content-sha256', input.payloadHash);
    canonicalHeaders.set('x-amz-date', amzDate);
    if (this.config.sessionToken) {
      canonicalHeaders.set('x-amz-security-token', this.config.sessionToken);
    }

    const signedHeaderNames = [...canonicalHeaders.keys()].sort();
    const canonicalHeadersText = signedHeaderNames
      .map((name) => `${name}:${canonicalHeaders.get(name)!}\n`)
      .join('');
    const signedHeaders = signedHeaderNames.join(';');

    const canonicalRequest = [
      input.method,
      canonicalUri,
      '',
      canonicalHeadersText,
      signedHeaders,
      input.payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256Hex(new TextEncoder().encode(canonicalRequest)),
    ].join('\n');

    const signature = hmacHex(
      getSigningKey({
        secretAccessKey: this.config.secretAccessKey,
        dateStamp,
        region: this.config.region,
      }),
      stringToSign
    );

    const authorization = [
      `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    const headers: Record<string, string> = {
      authorization,
      host,
      'x-amz-content-sha256': input.payloadHash,
      'x-amz-date': amzDate,
    };
    if (this.config.sessionToken) {
      headers['x-amz-security-token'] = this.config.sessionToken;
    }
    if (input.contentType) {
      headers['content-type'] = input.contentType;
    }

    return { url, headers };
  }

  private resolveTarget(key: string): {
    host: string;
    canonicalUri: string;
    url: string;
  } {
    const encodedKey = encodeObjectKey(key);
    const basePath = normalizeBasePath(this.endpoint.pathname);

    if (this.forcePathStyle) {
      const canonicalUri = joinPath(basePath, this.config.bucket, encodedKey);
      const url = `${this.endpoint.protocol}//${this.endpoint.host}${canonicalUri}`;
      return { host: this.endpoint.host, canonicalUri, url };
    }

    const host = `${this.config.bucket}.${this.endpoint.host}`;
    const canonicalUri = joinPath(basePath, encodedKey);
    const url = `${this.endpoint.protocol}//${host}${canonicalUri}`;
    return { host, canonicalUri, url };
  }

  private toStoragePath(key: string): string {
    return `s3://${this.config.bucket}/${key}`;
  }

  private extractObjectKey(storagePathOrKey: string): string {
    if (storagePathOrKey.startsWith('s3://')) {
      const withoutPrefix = storagePathOrKey.slice(5);
      const slashIndex = withoutPrefix.indexOf('/');
      return slashIndex >= 0 ? withoutPrefix.slice(slashIndex + 1) : withoutPrefix;
    }

    if (storagePathOrKey.startsWith('http://') || storagePathOrKey.startsWith('https://')) {
      const parsed = new URL(storagePathOrKey);
      const path = parsed.pathname.replace(/^\/+/, '');
      const bucketPrefix = `${this.config.bucket}/`;
      if (path.startsWith(bucketPrefix)) {
        return path.slice(bucketPrefix.length);
      }
      return path;
    }

    return normalizeObjectKey(storagePathOrKey);
  }
}

function normalizeObjectKey(key: string): string {
  return key.replace(/^\/+/, '');
}

function normalizeBasePath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '';
  }
  return pathname.replace(/\/+$/, '');
}

function joinPath(...parts: string[]): string {
  const cleaned = parts
    .filter((part) => part.length > 0)
    .map((part) => part.replace(/^\/+|\/+$/g, ''));
  if (cleaned.length === 0) {
    return '/';
  }
  return `/${cleaned.join('/')}`;
}

function encodeObjectKey(key: string): string {
  return key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function sha256Hex(value: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(value)).digest('hex');
}

function hmac(key: Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

function getSigningKey(params: {
  secretAccessKey: string;
  dateStamp: string;
  region: string;
}): Buffer {
  const kDate = hmac(Buffer.from(`AWS4${params.secretAccessKey}`, 'utf8'), params.dateStamp);
  const kRegion = hmac(kDate, params.region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}
