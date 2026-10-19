// S3-compatible storage (AWS S3, Cloudflare R2, Backblaze B2, MinIO …) so the shop is not tied to one cloud
// (A2.9.15 "runs anywhere"). The access key pair is in the vault (`s3.accessKeyId`, `s3.secretAccessKey`); bucket,
// region and endpoint are plain config.
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import { memoryStorage } from './memory';
import { assertKey, probe, type Storage } from './types';

export const s3Config = z.object({
  bucket: z.string().min(3).max(63),
  region: z.string().min(1),
  /** Needed for anything but AWS itself, e.g. https://<account>.r2.cloudflarestorage.com. */
  endpoint: z.url().optional(),
  /** Path-style URLs (bucket in the path); most S3-compatible services want this. */
  forcePathStyle: z.boolean().optional(),
});
type Config = z.infer<typeof s3Config>;

export function s3Storage(config: Config, accessKeyId: string, secretAccessKey: string): Storage {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle ?? config.endpoint !== undefined,
    credentials: { accessKeyId, secretAccessKey },
  });
  const Bucket = config.bucket;

  return {
    provider: 'S3_COMPATIBLE',
    async put(key, body, contentType) {
      assertKey(key);
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
      return { key, bytes: body.byteLength, contentType };
    },
    async get(key) {
      assertKey(key);
      try {
        const r = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        const body = r.Body ? await r.Body.transformToByteArray() : new Uint8Array();
        return { body, contentType: r.ContentType ?? 'application/octet-stream' };
      } catch (e) {
        if (notFound(e)) return null;
        throw e;
      }
    },
    async head(key) {
      assertKey(key);
      try {
        const r = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { key, bytes: r.ContentLength ?? 0, contentType: r.ContentType ?? 'application/octet-stream' };
      } catch (e) {
        if (notFound(e)) return null;
        throw e;
      }
    },
  };
}

function notFound(e: unknown) {
  return e instanceof S3ServiceException && (e.$metadata.httpStatusCode === 404 || e.name === 'NoSuchKey' || e.name === 'NotFound');
}

export const s3 = defineAdapter<Storage, Config>({
  kind: 'STORAGE',
  provider: 's3',
  modes: ['SANDBOX', 'LIVE'],
  secrets: ['accessKeyId', 'secretAccessKey'],
  configSchema: s3Config,
  async create(ctx) {
    return s3Storage(ctx.config, await requireSecret(ctx, 'accessKeyId'), await requireSecret(ctx, 'secretAccessKey'));
  },
  async mock() {
    return memoryStorage('S3_COMPATIBLE');
  },
  async test(api) {
    return { ok: true, message: await probe(api) };
  },
});
