// PR 725 (CN-049, 15 Nov 2026) — the practice shop fills and shows itself; nobody presses a button.
// `ensurePractice` is the one idempotent step: it (1) brings every practice product to the state of `practice.enabled`
// (live while on, hidden while off), (2) while on and `practice.autoFill` is on, fills the store with the sample world when
// it holds no practice product, and (3) makes the sample pictures in small steps. It is cheap when everything is in place
// (three small counts) and race-safe across processes: each piece of work first takes a short lease (an IdempotencyKey row
// with a unique scope and key; a lease left by a crashed process expires), so two servers, or a button and the clock, never
// work on the same piece at once. The seeder itself is idempotent (ids made from the record's own key), so a lost lease
// can at worst repeat a step, never double the data.
// Callers: the server clock (keeper.ts, from instrumentation.ts), "Turn on" and "Add sample data" (api.ts).
import type { PrismaClient } from '@extas/db/client';
import type { MediaDeps } from '@extas/media';
import type { AdminDeps } from '../admin-auth';
import { DEMO_PACK } from './data';
import { practiceId } from './ids';
import { addPracticePhotos, repairPracticePhotos } from './photos';
import { seedPractice, type SeedResult } from './seed';
import { practiceVisibilityDrift, syncPracticeVisibility } from './visibility';

/** How long a lease holds before another worker may take the work (a crashed process never blocks it for long). */
const LEASE_MS = 600_000; // hardcode-ok: a technical lease time, not a business number
/** Pictures made per step (small steps, so the shop is never slowed). */
export const PHOTO_STEP = 10; // hardcode-ok: a technical step size
/** The least pictures a practice product has when it is done: the owner's "4 or more per product". */
export const PRACTICE_MIN_PHOTOS = 4; // hardcode-ok: the owner's decision of 15 Nov 2026 (4+ pictures per sample product)

const SCOPE = 'practice.fill'; // hardcode-ok: a lease name

export interface EnsureDeps {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
  media?: MediaDeps | null;
  now?: () => Date;
}

export interface EnsureResult {
  on: boolean;
  shown: number;
  hidden: number;
  seeded: SeedResult | null;
  photos: number;
  /** More work is waiting (the clock should come back soon). */
  pending: boolean;
}

const isUnique = (e: unknown) => (e as { code?: string } | null)?.code === 'P2002';

/** Takes the lease of one piece of work; false when another worker holds it. */
export async function takeLease(db: PrismaClient, name: string, storeId: number, now: Date): Promise<boolean> {
  const key = `${name}:${storeId}`;
  await db.idempotencyKey.deleteMany({ where: { scope: SCOPE, key, expiresAt: { lt: now } } });
  try {
    await db.idempotencyKey.create({ data: { scope: SCOPE, key, requestHash: name, lockedUntil: new Date(now.getTime() + LEASE_MS), expiresAt: new Date(now.getTime() + LEASE_MS) } });
    return true;
  } catch (e) {
    if (isUnique(e)) return false;
    throw e;
  }
}

export async function dropLease(db: PrismaClient, name: string, storeId: number): Promise<void> {
  await db.idempotencyKey.deleteMany({ where: { scope: SCOPE, key: `${name}:${storeId}` } });
}

/** Is the demo's catalogue not in the store yet (its first or last style missing: an empty store, or the older generic practice products)? */
export async function demoCatalogueMissing(db: PrismaClient, storeId: number): Promise<boolean> {
  const ends = [DEMO_PACK.products[0]!, DEMO_PACK.products[DEMO_PACK.products.length - 1]!].map((p) => practiceId(`product:${p.id}`));
  return (await db.product.count({ where: { storeId, isPractice: true, id: { in: ends } } })) < ends.length;
}

/** Practice products that still have fewer pictures than the owner asked for. */
export async function productsWithoutPictures(db: PrismaClient, storeId: number): Promise<number> {
  const rows = await db.product.findMany({ where: { storeId, isPractice: true, archivedAt: null }, select: { _count: { select: { media: { where: { archivedAt: null } } } } } });
  return rows.filter((r) => r._count.media < PRACTICE_MIN_PHOTOS).length;
}

export async function ensurePractice(deps: EnsureDeps, storeId: number, opts: { photos?: boolean; force?: boolean } = {}): Promise<EnsureResult> {
  const now = deps.now ? deps.now() : new Date();
  const [enabled, auto] = await Promise.all([deps.resolver.value('practice.enabled', { storeId }), deps.resolver.value('practice.autoFill', { storeId })]);
  const out: EnsureResult = { on: enabled.on, shown: 0, hidden: 0, seeded: null, photos: 0, pending: false };

  // 1. fill (only while on; `force` is the "Add sample data" button, which fills whatever the automatic switch says)
  if (enabled.on && (auto.on || opts.force) && (await demoCatalogueMissing(deps.db, storeId))) {
    if (await takeLease(deps.db, 'fill', storeId, now)) {
      try {
        out.seeded = await seedPractice(deps.db, storeId, now);
      } finally {
        await dropLease(deps.db, 'fill', storeId);
      }
    } else out.pending = true;
  }

  // 2. show or hide: the one switch
  if (await practiceVisibilityDrift(deps.db, storeId, enabled.on)) {
    const r = await syncPracticeVisibility(deps.db, storeId, enabled.on, now);
    out.shown = r.shown;
    out.hidden = r.hidden;
  }

  // 3. pictures, in small steps, only while on, only with the media storage, never in a request unless asked
  if (enabled.on && opts.photos !== false && deps.media && (await productsWithoutPictures(deps.db, storeId)) > 0) {
    if (await takeLease(deps.db, 'photos', storeId, now)) {
      try {
        const r = await addPracticePhotos(deps.media, storeId, { maxPhotos: PHOTO_STEP });
        out.photos = r.photos;
        // no picture is made while the files would not last (per-process storage): the clock does not spin on it
        out.pending = out.pending || (!r.complete && !r.blocked);
        if (r.blocked) warnOnce('practice: pictures are paused: the media storage is in this server process only (set EXTAS_MEDIA_DIR or connect Blob/S3)');
      } finally {
        await dropLease(deps.db, 'photos', storeId);
      }
    } else out.pending = true;
  }
  // 4. pictures whose files are gone from storage are drawn and put back (a few per step, walking the library round)
  if (enabled.on && opts.photos !== false && deps.media && out.photos === 0) {
    const g = globalThis as unknown as { __practiceRepairAfter?: string | null };
    if (await takeLease(deps.db, 'repair', storeId, now)) {
      try {
        const r = await repairPracticePhotos(deps.media, storeId, { after: g.__practiceRepairAfter ?? null });
        g.__practiceRepairAfter = r.next;
        if (r.repaired) console.warn(`practice: ${r.repaired} picture(s) had lost their files and were made again`);
      } finally {
        await dropLease(deps.db, 'repair', storeId);
      }
    }
  }
  return out;
}

const said = new Set<string>();
function warnOnce(text: string): void {
  if (said.has(text)) return;
  said.add(text);
  console.warn(text);
}
