// Follow-up 505 (PR 425, 426; Blueprint B4.8) — the app's wiring of @extas/support copyPendingFiles: right after a
// Messenger or WhatsApp webhook took customer messages, the store's files waiting to be copied are read through the
// channel's own adapter (@extas/adapters media-download, behind the SSRF guard) and saved to the media library
// (folder `support`, private to Support), all after the answer has gone back to Meta (`after`), so the webhook stays
// quick. A channel on the practice mock (no key yet) gives the mock's sample picture; a live WhatsApp connection reads
// with its own token, a live Messenger Page reads the offered link. Only `support.fileCopy` on copies anything.
// A file's type is kept only from a short list of safe kinds (anything else is saved as a plain download), because the
// Support inbox serves our copy back to the team.
import { after } from 'next/server';
import { mockChannelFileFetcher, publicLinkFetcher, whatsappFileFetcher, type Connections } from '@extas/adapters';
import { storeGeneratedFile } from '@extas/media';
import * as sp from '@extas/support';
import type { AdminDeps } from './admin-auth';
import { mediaDeps } from './media';

/** What a copied file may say it is, with its file ending; anything else is `application/octet-stream`. */
const SAFE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
};
export const safeFileType = (contentType: string): { contentType: string; extension: string } => {
  const t = contentType.split(';')[0]!.trim().toLowerCase();
  return SAFE_TYPES[t] ? { contentType: t, extension: SAFE_TYPES[t]! } : { contentType: 'application/octet-stream', extension: 'bin' };
};

const MEDIA_KINDS = new Set(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER']);
/** What the reader says it is when it downloads a channel file. */
const AGENT = 'Mozilla/5.0 (compatible; support-file-copy)';

/** The channel's fetcher: the mock while its connection is on the practice mock, else the live one. */
export async function fetcherFor(connections: Pick<Connections, 'use' | 'secretOf'>, storeId: number, kind: string): Promise<sp.SupportFileFetcher | null> {
  if (kind === 'whatsapp') {
    const c = await connections.use('WHATSAPP', { storeId });
    if (c.mode === 'MOCK') return mockChannelFileFetcher();
    const token = await connections.secretOf('WHATSAPP', 'accessToken', { storeId });
    return token ? whatsappFileFetcher({ token: token.value, userAgent: AGENT }) : null;
  }
  if (kind === 'messenger') {
    const c = await connections.use('MESSENGER', { storeId });
    return c.mode === 'MOCK' ? mockChannelFileFetcher() : publicLinkFetcher({ userAgent: AGENT });
  }
  return null;
}

export function fileCopyWiring(deps: AdminDeps, connections: () => Promise<Pick<Connections, 'use' | 'secretOf'>>): sp.FileCopyWiring {
  return {
    fetcherFor: async (storeId, kind) => fetcherFor(await connections(), storeId, kind),
    async save(storeId, f) {
      const media = mediaDeps();
      if (!media) throw new Error('media storage is not configured');
      const t = safeFileType(f.contentType);
      const a = await storeGeneratedFile(media, { storeId, kind: (MEDIA_KINDS.has(f.kind) ? f.kind : 'OTHER') as 'IMAGE', body: f.body, contentType: t.contentType, name: 'customer file', extension: t.extension, folder: 'support', fileName: f.fileName });
      return a.id;
    },
  };
}

/** After the webhook's answer: one copy turn for the store (a failure is logged and tried again on the next webhook). */
export function copyChannelFilesSoon(deps: AdminDeps, storeId: number, connections: () => Promise<Pick<Connections, 'use' | 'secretOf'>>): void {
  after(async () => {
    try {
      await sp.copyPendingFiles({ db: deps.db, settings: deps.resolver, now: deps.now }, storeId, fileCopyWiring(deps, connections));
    } catch (e) {
      console.error(`[support file copy] ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    }
  });
}
