// The storage adapters and the default when nothing is connected: local disk on the media volume (A2.9.15).
import type { Fallback } from '../connections';
import { azureBlob } from './azure-blob';
import { localDisk } from './local-disk';
import { s3 } from './s3';

export * from './types';
export { memoryStorage } from './memory';
export { localDisk, localDiskStorage, localDiskConfig } from './local-disk';
export { azureBlob, azureBlobStorage, azureBlobConfig } from './azure-blob';
export { s3, s3Storage, s3Config } from './s3';

export const storageAdapters = [localDisk, azureBlob, s3] as const;

/** Local disk under EXTAS_MEDIA_DIR (the app's media volume) when no Blob or S3 connection is switched on. */
export function storageFallback(env: NodeJS.ProcessEnv = process.env): Fallback | undefined {
  const root = env.EXTAS_MEDIA_DIR;
  return root ? { provider: localDisk.provider, mode: 'LIVE', config: { root } } : undefined;
}
