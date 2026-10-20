// PR 22, 37 — the heavy work, shaped as jobs a BullMQ worker (the image worker, PR 6) calls with a small JSON
// payload; the same functions run inline in this process until the worker exists (`media.processing.mode`).
//
// - `media.render`: makes every size × format of one original and records them. Idempotent: a rendition whose name
//   (content hash of the original + its settings) is already recorded is not made again. A changed setting gives new
//   names, so the job makes new files; the old files stay where they are (nothing is deleted) and the change, old
//   names included, is in the audit log.
// - `media.regenerate`: runs `media.render` for every original of a store (after a size or quality change).
import { audit, SYSTEM } from '@extas/auth';
import { renderConfig, type ImageFormat, type RenderConfig } from './config';
import { nowOf, type MediaDeps } from './deps';
import { MediaError } from './errors';
import { renditionKey, slugOfKey, variantHash } from './naming';
import { standardise } from './process';

export const MEDIA_QUEUE = 'media';

export type MediaJob = { name: 'media.render'; assetId: string; force?: boolean } | { name: 'media.regenerate'; storeId: number };

export interface PlannedRendition {
  preset: string;
  format: ImageFormat;
  key: string;
}

/** The renditions an original must have under the current settings, with their file names. */
export function planRenditions(asset: { id: string; storeId: number; storageKey: string; checksumSha256: string }, cfg: RenderConfig): PlannedRendition[] {
  const slug = slugOfKey(asset.storageKey);
  const out: PlannedRendition[] = [];
  for (const p of cfg.presets) {
    for (const format of cfg.formats) {
      const hash = variantHash({
        c: asset.checksumSha256,
        p: p.name,
        w: p.width,
        f: format,
        q: cfg.quality,
        e: format === 'avif' ? cfg.avifEffort : null,
        r: cfg.ratio,
        fit: cfg.fit,
        bg: cfg.background.toLowerCase(),
      });
      out.push({ preset: p.name, format, key: renditionKey({ storeId: asset.storeId, assetId: asset.id, slug, preset: p.name, format, hash }) });
    }
  }
  return out;
}

export interface RenderResult {
  assetId: string;
  status: 'rendered' | 'unchanged' | 'skipped';
  renditions: number;
}

export async function renderAsset(deps: MediaDeps, assetId: string, opts: { force?: boolean } = {}): Promise<RenderResult> {
  const asset = await deps.db.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new MediaError('NOT_FOUND', 'no such file');
  if (asset.kind !== 'IMAGE' || asset.archivedAt) return { assetId, status: 'skipped', renditions: 0 };

  const cfg = await renderConfig(deps.settings, asset.storeId);
  const plan = planRenditions(asset, cfg);
  const existing = await deps.db.mediaRendition.findMany({ where: { assetId } });
  const have = new Map(existing.map((r) => [`${r.preset}:${r.format}`, r]));
  if (!opts.force && plan.every((p) => have.get(`${p.preset}:${p.format}`)?.storageKey === p.key)) {
    return { assetId, status: 'unchanged', renditions: plan.length };
  }

  // Every file of an asset lives with its original (the provider recorded on the asset).
  const storage = await deps.storage(asset.storeId, asset.storage);
  const original = await storage.get(asset.storageKey);
  if (!original) throw new MediaError('NOT_FOUND', 'the original file is missing from storage', [asset.storageKey]);
  const std = await standardise(original.body, cfg);

  const keyOf = new Map(plan.map((p) => [`${p.preset}:${p.format}`, p.key]));
  const rows: { preset: string; format: string; width: number; height: number; bytes: number; quality: number; storageKey: string }[] = [];
  for (const f of std.files) {
    const key = keyOf.get(`${f.preset}:${f.format}`)!;
    await storage.put(key, f.body, `image/${f.format}`);
    rows.push({ preset: f.preset, format: f.format, width: f.width, height: f.height, bytes: f.body.byteLength, quality: f.quality, storageKey: key });
  }

  const replaced = rows
    .map((r) => ({ r, old: have.get(`${r.preset}:${r.format}`) }))
    .filter((x) => x.old && x.old.storageKey !== x.r.storageKey)
    .map((x) => x.old!.storageKey);
  await deps.db.$transaction(async (tx) => {
    for (const r of rows) {
      await tx.mediaRendition.upsert({
        where: { assetId_preset_format: { assetId, preset: r.preset, format: r.format } },
        create: { storeId: asset.storeId, assetId, ...r },
        update: { width: r.width, height: r.height, bytes: r.bytes, quality: r.quality, storageKey: r.storageKey },
      });
    }
    await tx.mediaAsset.update({ where: { id: assetId }, data: { dominantColor: std.dominantColor } });
    await audit(tx, SYSTEM, {
      storeId: asset.storeId,
      action: 'media.render',
      entityType: 'MediaAsset',
      entityId: assetId,
      before: replaced.length ? { replacedFiles: replaced } : null,
      after: { renditions: rows.length, quality: cfg.quality, presets: cfg.presets.map((p) => p.name), formats: cfg.formats, at: nowOf(deps).toISOString() },
    }, { source: 'media-job' });
  });
  return { assetId, status: 'rendered', renditions: rows.length };
}

export interface RegenerateResult {
  storeId: number;
  rendered: number;
  unchanged: number;
  failed: string[];
}

/** Every original of a store, in pages; one failing photo does not stop the rest (it is reported and logged). */
export async function regenerateStore(deps: MediaDeps, storeId: number): Promise<RegenerateResult> {
  const out: RegenerateResult = { storeId, rendered: 0, unchanged: 0, failed: [] };
  const take = await deps.settings.value('media.library.pageSize', { storeId });
  let cursor: string | undefined;
  for (;;) {
    const page = await deps.db.mediaAsset.findMany({
      where: { storeId, kind: 'IMAGE', archivedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    for (const { id } of page) {
      try {
        const r = await renderAsset(deps, id);
        if (r.status === 'rendered') out.rendered++;
        else out.unchanged++;
      } catch (e) {
        out.failed.push(id);
        await logFailure(deps, storeId, id, e);
      }
    }
    if (page.length < take) break;
    cursor = page[page.length - 1]!.id;
  }
  return out;
}

/** Originals that have no rendition at all yet (an upload whose job never ran), oldest first. */
export async function pendingAssets(deps: Pick<MediaDeps, 'db'>, opts: { storeId?: number; take: number; exclude?: string[] }): Promise<string[]> {
  const rows = await deps.db.mediaAsset.findMany({
    where: {
      kind: 'IMAGE',
      archivedAt: null,
      renditions: { none: {} },
      ...(opts.storeId ? { storeId: opts.storeId } : {}),
      ...(opts.exclude?.length ? { id: { notIn: opts.exclude } } : {}),
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: opts.take,
  });
  return rows.map((r) => r.id);
}

export async function runJob(deps: MediaDeps, job: MediaJob): Promise<RenderResult | RegenerateResult> {
  switch (job.name) {
    case 'media.render':
      return renderAsset(deps, job.assetId, { force: job.force });
    case 'media.regenerate':
      return regenerateStore(deps, job.storeId);
  }
}

async function logFailure(deps: MediaDeps, storeId: number | null, assetId: string, e: unknown) {
  const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
  console.warn(`media: rendering ${assetId} failed (${message})`);
  try {
    await audit(deps.db, SYSTEM, { storeId, action: 'media.render.failed', entityType: 'MediaAsset', entityId: assetId, after: { message } }, { source: 'media-job' });
  } catch {
    // the log line above is enough when even the database is down
  }
}

// Inline runs happen one at a time per process, so ten uploads never make ten sharp pipelines at once.
let chain: Promise<unknown> = Promise.resolve();

/** Runs the job after the ones already waiting in this process; failures are logged, never thrown at the caller. */
export function runInlineSerial(deps: MediaDeps, job: MediaJob): Promise<void> {
  const next = chain.then(async () => {
    try {
      await runJob(deps, job);
    } catch (e) {
      const storeId = job.name === 'media.regenerate' ? job.storeId : null;
      if (job.name === 'media.render') {
        const a = await deps.db.mediaAsset.findUnique({ where: { id: job.assetId }, select: { storeId: true } }).catch(() => null);
        await logFailure(deps, a?.storeId ?? null, job.assetId, e);
      } else console.warn(`media: regenerating store ${storeId} failed (${e instanceof Error ? e.message : String(e)})`);
    }
  });
  chain = next.catch(() => {});
  return next;
}

/**
 * Hands a job to the worker when the queue mode is on and a queue is wired, else runs it here: deferred when the app
 * gave a `defer` (after the response is sent), awaited otherwise (tests, the CLI).
 */
export async function dispatch(deps: MediaDeps, job: MediaJob, mode: 'inline' | 'queue'): Promise<'queued' | 'deferred' | 'done'> {
  if (mode === 'queue' && deps.enqueue) {
    await deps.enqueue(job);
    return 'queued';
  }
  if (deps.defer) {
    deps.defer(() => runInlineSerial(deps, job));
    return 'deferred';
  }
  await runJob(deps, job);
  return 'done';
}
