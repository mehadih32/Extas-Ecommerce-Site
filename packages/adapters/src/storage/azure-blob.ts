// Azure Blob storage (the server's media and backup target). The account key is a vault secret
// (`azureBlob.accountKey`); account name and container are plain config. SANDBOX points `endpoint` at Azurite or any
// test account; LIVE uses https://<account>.blob.core.windows.net unless `endpoint` overrides it.
import { BlobServiceClient, RestError, StorageSharedKeyCredential } from '@azure/storage-blob';
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import { sharedMemoryStorage } from './memory';
import { assertKey, probe, type Storage } from './types';

export const azureBlobConfig = z.object({
  accountName: z.string().regex(/^[a-z0-9]{3,24}$/, { message: 'not an Azure storage account name' }),
  container: z.string().regex(/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,62}$/, { message: 'not a container name' }),
  /** Full service URL, e.g. an Azurite endpoint for SANDBOX. */
  endpoint: z.url().optional(),
});
type Config = z.infer<typeof azureBlobConfig>;

export function azureBlobStorage(config: Config, accountKey: string): Storage {
  const url = config.endpoint ?? `https://${config.accountName}.blob.core.windows.net`;
  const service = new BlobServiceClient(url, new StorageSharedKeyCredential(config.accountName, accountKey));
  const container = service.getContainerClient(config.container);
  const blob = (key: string) => {
    assertKey(key);
    return container.getBlockBlobClient(key);
  };

  return {
    provider: 'AZURE_BLOB',
    async put(key, body, contentType) {
      await blob(key).uploadData(body, { blobHTTPHeaders: { blobContentType: contentType } });
      return { key, bytes: body.byteLength, contentType };
    },
    async get(key) {
      try {
        const b = blob(key);
        const props = await b.getProperties();
        const body = await b.downloadToBuffer();
        return { body: new Uint8Array(body), contentType: props.contentType ?? 'application/octet-stream' };
      } catch (e) {
        if (notFound(e)) return null;
        throw e;
      }
    },
    async head(key) {
      try {
        const p = await blob(key).getProperties();
        return { key, bytes: p.contentLength ?? 0, contentType: p.contentType ?? 'application/octet-stream' };
      } catch (e) {
        if (notFound(e)) return null;
        throw e;
      }
    },
  };
}

function notFound(e: unknown) {
  return e instanceof RestError && e.statusCode === 404;
}

export const azureBlob = defineAdapter<Storage, Config>({
  kind: 'STORAGE',
  provider: 'azureBlob',
  modes: ['SANDBOX', 'LIVE'],
  secrets: ['accountKey'],
  configSchema: azureBlobConfig,
  async create(ctx) {
    return azureBlobStorage(ctx.config, await requireSecret(ctx, 'accountKey'));
  },
  async mock() {
    return sharedMemoryStorage('AZURE_BLOB');
  },
  async test(api) {
    return { ok: true, message: await probe(api) };
  },
});
