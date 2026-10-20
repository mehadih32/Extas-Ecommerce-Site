// Local disk storage: the default when no Blob or S3 connection is set up ("works without Blob", A2.9.15). Files live
// under <root>/objects/<key>; the content type sits next to them under <root>/meta/<key>.json. Writes go to a temp file
// first and are renamed into place, so a reader never sees half a file.
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { AdapterError, defineAdapter } from '../define';
import { sharedMemoryStorage } from './memory';
import { assertKey, probe, type Storage } from './types';

export function localDiskStorage(root: string): Storage {
  if (!path.isAbsolute(root)) throw new AdapterError('local storage root must be an absolute path');
  const objects = path.join(root, 'objects');
  const meta = path.join(root, 'meta');

  function file(base: string, key: string, suffix = '') {
    assertKey(key);
    const p = path.join(base, key + suffix);
    // assertKey already refuses `..`; this is the belt to its braces.
    if (!p.startsWith(base + path.sep)) throw new AdapterError('storage key escapes the storage root');
    return p;
  }

  async function atomicWrite(target: string, data: Uint8Array | string) {
    await mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, target);
  }

  return {
    provider: 'LOCAL_DISK',
    async put(key, body, contentType) {
      await atomicWrite(file(objects, key), body);
      await atomicWrite(file(meta, key, '.json'), JSON.stringify({ contentType }));
      return { key, bytes: body.byteLength, contentType };
    },
    async get(key) {
      try {
        const body = await readFile(file(objects, key));
        return { body: new Uint8Array(body), contentType: await contentTypeOf(key) };
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    },
    async head(key) {
      try {
        const s = await stat(file(objects, key));
        if (!s.isFile()) return null;
        return { key, bytes: s.size, contentType: await contentTypeOf(key) };
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    },
  };

  async function contentTypeOf(key: string): Promise<string> {
    try {
      const m = JSON.parse(await readFile(file(meta, key, '.json'), 'utf8')) as { contentType?: string };
      return m.contentType ?? 'application/octet-stream';
    } catch {
      return 'application/octet-stream';
    }
  }
}

function isMissing(e: unknown) {
  const code = (e as { code?: string }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

export const localDiskConfig = z.object({
  /** Absolute directory; on the server the app's media volume (EXTAS_MEDIA_DIR). */
  root: z.string().min(1),
});

export const localDisk = defineAdapter<Storage, z.infer<typeof localDiskConfig>>({
  kind: 'STORAGE',
  provider: 'localDisk',
  modes: ['LIVE'],
  secrets: [],
  configSchema: localDiskConfig,
  async create(ctx) {
    return localDiskStorage(ctx.config.root);
  },
  async mock() {
    return sharedMemoryStorage('LOCAL_DISK');
  },
  async test(api) {
    return { ok: true, message: await probe(api) };
  },
});
