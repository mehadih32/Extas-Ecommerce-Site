// The storage contract, run against every storage adapter that can be reached: memory and local disk always; Azure Blob
// when AZURITE_BLOB_URL (+ AZURITE_ACCOUNT, AZURITE_ACCOUNT_KEY) points at Azurite or a test account; S3 when
// S3_TEST_ENDPOINT (+ S3_TEST_ACCESS_KEY, S3_TEST_SECRET_KEY) points at an S3-compatible test server.
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AdapterError,
  assertKey,
  azureBlobStorage,
  localDisk,
  localDiskStorage,
  memoryStorage,
  probe,
  s3Storage,
  storageFallback,
  type Storage,
} from '../src';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

function contract(name: string, make: () => Promise<Storage>, enabled = true) {
  describe.skipIf(!enabled)(`storage contract: ${name}`, () => {
    let s: Storage;
    const prefix = `test-${Date.now().toString(36)}`;
    beforeAll(async () => {
      s = await make();
    });

    it('writes and reads back bytes and content type', async () => {
      const put = await s.put(`${prefix}/a/hello.txt`, enc('hello'), 'text/plain');
      expect(put).toEqual({ key: `${prefix}/a/hello.txt`, bytes: 5, contentType: 'text/plain' });
      const got = await s.get(`${prefix}/a/hello.txt`);
      expect(got && dec(got.body)).toBe('hello');
      expect(got?.contentType).toBe('text/plain');
    });

    it('reports size and type without reading the body', async () => {
      await s.put(`${prefix}/img.webp`, new Uint8Array([1, 2, 3, 4]), 'image/webp');
      expect(await s.head(`${prefix}/img.webp`)).toEqual({ key: `${prefix}/img.webp`, bytes: 4, contentType: 'image/webp' });
    });

    it('returns null for a missing object', async () => {
      expect(await s.get(`${prefix}/nothing-here`)).toBeNull();
      expect(await s.head(`${prefix}/nothing-here`)).toBeNull();
    });

    it('replaces an object written twice', async () => {
      await s.put(`${prefix}/twice.txt`, enc('one'), 'text/plain');
      await s.put(`${prefix}/twice.txt`, enc('two!'), 'text/markdown');
      const got = await s.get(`${prefix}/twice.txt`);
      expect(got && dec(got.body)).toBe('two!');
      expect(got?.contentType).toBe('text/markdown');
    });

    it('refuses keys that are not plain relative paths', async () => {
      for (const bad of ['../x', '/abs', 'a//b', 'a/./b', 'a/../b', '', 'sp ace', 'x\\y']) {
        await expect(s.put(bad, enc('x'), 'text/plain'), bad).rejects.toBeInstanceOf(AdapterError);
        await expect(s.get(bad), bad).rejects.toBeInstanceOf(AdapterError);
      }
    });

    it('passes the connection test probe', async () => {
      expect(await probe(s)).toMatch(/read back/);
    });
  });
}

let diskRoot = '';
beforeAll(async () => {
  diskRoot = await mkdtemp(path.join(tmpdir(), 'extas-storage-'));
});
afterAll(async () => {
  if (diskRoot) await rm(diskRoot, { recursive: true, force: true });
});

contract('memory (mock)', async () => memoryStorage());
contract('local disk', async () => localDiskStorage(diskRoot));

const az = process.env.AZURITE_BLOB_URL;
contract(
  'Azure Blob',
  async () => {
    const account = process.env.AZURITE_ACCOUNT ?? '';
    const key = process.env.AZURITE_ACCOUNT_KEY ?? '';
    const container = 'extas-test';
    const svc = new BlobServiceClient(az ?? '', new StorageSharedKeyCredential(account, key));
    await svc.getContainerClient(container).createIfNotExists();
    return azureBlobStorage({ accountName: account, container, endpoint: az }, key);
  },
  !!az,
);

const s3url = process.env.S3_TEST_ENDPOINT;
contract(
  'S3-compatible',
  async () => {
    const accessKeyId = process.env.S3_TEST_ACCESS_KEY ?? '';
    const secretAccessKey = process.env.S3_TEST_SECRET_KEY ?? '';
    const bucket = 'extas-test';
    const client = new S3Client({ region: 'us-east-1', endpoint: s3url, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
    await client.send(new CreateBucketCommand({ Bucket: bucket })).catch(() => undefined);
    return s3Storage({ bucket, region: 'us-east-1', endpoint: s3url }, accessKeyId, secretAccessKey);
  },
  !!s3url,
);

describe('local disk specifics', () => {
  it('needs an absolute root', () => {
    expect(() => localDiskStorage('relative/dir')).toThrow(AdapterError);
  });

  it('leaves no temp files behind and keeps files under objects/', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'extas-storage-'));
    try {
      const s = localDiskStorage(root);
      await s.put('a/b.txt', enc('x'), 'text/plain');
      expect(await readdir(path.join(root, 'objects', 'a'))).toEqual(['b.txt']);
      expect(await readdir(path.join(root, 'meta', 'a'))).toEqual(['b.txt.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('is the fallback on the media volume, and only when the media dir is known', () => {
    expect(storageFallback({ EXTAS_MEDIA_DIR: '/media' })).toEqual({ provider: localDisk.provider, mode: 'LIVE', config: { root: '/media' } });
    expect(storageFallback({})).toBeUndefined();
  });
});

describe('storage keys', () => {
  it('accepts normal media paths', () => {
    for (const ok of ['media/2026/10/abc.webp', '_extas/connection-test.txt', 'a', 'a-b_c.d/e']) expect(() => assertKey(ok)).not.toThrow();
  });
});
