// Follow-up 505 (PR 425, 426; Blueprint B4.8) — a file a customer sent on Messenger or WhatsApp is copied to the
// shop's own storage, because Meta keeps none. While `support.fileCopy` is on (registry v273, off as shipped), the
// store's PENDING files (oldest first, `perRun` at a time) are read through the channel's own fetcher (the app gives
// one per channel kind: @extas/adapters media-download, behind the SSRF guard, on the mock until the key is in) and
// saved through `save` (the media library, folder `support`). A copied file is STORED with its expiry date by kind
// (`photoDays`, `videoDays`, `otherDays`; recorded only — nothing is removed here). A file larger than `maxMb`, one the
// channel refuses for good, or one still not given after `giveUpHours`, is FAILED ("could not be copied"); a passing
// problem (the channel busy, the network) leaves it PENDING for the next turn. Safe to run twice at once: the file row
// is written STORED once only (its own conditional update); two turns racing on one file at worst leave one spare copy
// in the library, which its orphan clean-up lists.
// Never here: a reply, a message to anyone, money, or a deletion.
import { nowOf, setting, type SupportDeps } from './context';

/** What the copy needs from a channel's file adapter (structurally @extas/adapters ChannelFileFetcher). */
export interface SupportFileFetcher {
  fetch(file: { sourceUrl: string; contentType?: string | null }, limits: { maxBytes: number; timeoutMs: number; maxRedirects: number }): Promise<{ body: Uint8Array; contentType: string }>;
}

export interface FileCopyWiring {
  /** The channel's fetcher by its kind (messenger, whatsapp); null: that channel cannot give files here. */
  fetcherFor(storeId: number, kind: string): Promise<SupportFileFetcher | null>;
  /** Saves our copy and gives its MediaAsset id. */
  save(storeId: number, file: { body: Uint8Array; contentType: string; kind: string; fileName: string | null }): Promise<string>;
  timeoutMs?: number;
}

export interface FileCopyResult {
  status: 'off' | 'ok';
  copied: number;
  failed: number;
  waiting: number;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Why a file could not be copied for good (anything else is tried again on the next turn). */
const FOR_GOOD = new Set(['BAD_URL', 'BLOCKED_ADDRESS', 'TOO_BIG', 'TOO_MANY_REDIRECTS', 'BAD_ANSWER']);
const forGood = (e: unknown): boolean => {
  const x = e as { code?: unknown; retryable?: unknown };
  if (x?.code === 'HTTP_ERROR') return x.retryable === false;
  return typeof x?.code === 'string' && FOR_GOOD.has(x.code);
};

const daysFor = (kind: string, s: { photoDays: number; videoDays: number; otherDays: number }) => (kind === 'IMAGE' ? s.photoDays : kind === 'VIDEO' ? s.videoDays : s.otherDays);

/** One turn of the store's copy (see the header). */
export async function copyPendingFiles(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, storeId: number, wiring: FileCopyWiring): Promise<FileCopyResult> {
  const s = await setting(deps, storeId, 'support.fileCopy');
  if (!s.enabled) return { status: 'off', copied: 0, failed: 0, waiting: 0 };
  const out: FileCopyResult = { status: 'ok', copied: 0, failed: 0, waiting: 0 };
  const rows = await deps.db.messageAttachment.findMany({
    where: { storeId, status: 'PENDING', assetId: null, removedAt: null, sourceUrl: { not: null } },
    orderBy: { createdAt: 'asc' },
    take: s.perRun,
    select: { id: true, kind: true, fileName: true, contentType: true, sourceUrl: true, createdAt: true, message: { select: { conversation: { select: { channel: { select: { kind: true } } } } } } },
  });
  const limits = { maxBytes: s.maxMb * 1024 * 1024, timeoutMs: wiring.timeoutMs ?? 30_000, maxRedirects: 3 };
  const fail = async (id: string) => {
    const n = await deps.db.messageAttachment.updateMany({ where: { id, status: 'PENDING', assetId: null }, data: { status: 'FAILED' } });
    out.failed += n.count;
  };
  for (const a of rows) {
    const now = nowOf(deps);
    const late = now.getTime() - a.createdAt.getTime() >= s.giveUpHours * HOUR;
    const fetcher = await wiring.fetcherFor(storeId, a.message.conversation.channel.kind);
    if (!fetcher) {
      if (late) await fail(a.id);
      else out.waiting++;
      continue;
    }
    let got: { body: Uint8Array; contentType: string };
    try {
      got = await fetcher.fetch({ sourceUrl: a.sourceUrl!, contentType: a.contentType }, limits);
      if (got.body.byteLength > limits.maxBytes) throw Object.assign(new Error('too big'), { code: 'TOO_BIG' });
    } catch (e) {
      if (forGood(e) || late) await fail(a.id);
      else out.waiting++;
      continue;
    }
    // claimed again just before saving: a second turn at once that got here first has stored it already
    const still = await deps.db.messageAttachment.count({ where: { id: a.id, status: 'PENDING', assetId: null } });
    if (!still) continue;
    const assetId = await wiring.save(storeId, { body: got.body, contentType: got.contentType, kind: a.kind, fileName: a.fileName });
    const n = await deps.db.messageAttachment.updateMany({
      where: { id: a.id, status: 'PENDING', assetId: null },
      data: { status: 'STORED', assetId, contentType: got.contentType || a.contentType, sizeBytes: got.body.byteLength, expiresAt: new Date(now.getTime() + daysFor(a.kind, s) * DAY) },
    });
    out.copied += n.count;
  }
  return out;
}
