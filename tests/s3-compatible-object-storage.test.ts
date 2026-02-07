import { describe, expect, test } from 'bun:test';
import {
  S3CompatibleObjectStorage,
  type S3CompatibleConfig,
} from '../src/infrastructure/storage/s3-compatible-object-storage';

describe('S3CompatibleObjectStorage', () => {
  const config: S3CompatibleConfig = {
    endpoint: 'https://s3.example.com',
    region: 'us-east-1',
    bucket: 'climabalance',
    accessKeyId: 'AKIATEST',
    secretAccessKey: 'SECRETTEST',
    forcePathStyle: true,
  };

  test('putObject signs and uploads payload', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedHeaders: Headers | undefined;

    const storage = new S3CompatibleObjectStorage(config, async (url, init) => {
      capturedUrl = String(url);
      capturedMethod = String(init?.method);
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return new Response(null, { status: 200 });
    });

    const storagePath = await storage.putObject({
      key: 'certificates/cert-1.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      contentType: 'application/pdf',
    });

    expect(storagePath).toBe('s3://climabalance/certificates/cert-1.pdf');
    expect(capturedMethod).toBe('PUT');
    expect(capturedUrl).toContain(
      'https://s3.example.com/climabalance/certificates/cert-1.pdf'
    );
    expect(capturedHeaders?.get('authorization')).toContain(
      'AWS4-HMAC-SHA256'
    );
    expect(capturedHeaders?.get('x-amz-date')).toBeTruthy();
    expect(capturedHeaders?.get('x-amz-content-sha256')).toHaveLength(64);
  });

  test('getObject downloads bytes by storage path', async () => {
    const payload = new Uint8Array([37, 80, 68, 70]); // %PDF
    const storage = new S3CompatibleObjectStorage(config, async (_url, init) => {
      expect(init?.method).toBe('GET');
      return new Response(payload, { status: 200 });
    });

    const bytes = await storage.getObject('s3://climabalance/certificates/cert-1.pdf');
    expect(Array.from(bytes)).toEqual(Array.from(payload));
  });

  test('deleteObject tolerates missing object', async () => {
    const storage = new S3CompatibleObjectStorage(config, async (_url, init) => {
      expect(init?.method).toBe('DELETE');
      return new Response(null, { status: 404 });
    });

    await expect(
      storage.deleteObject('s3://climabalance/certificates/unknown.pdf')
    ).resolves.toBeUndefined();
  });
});
