// S06 · PR 159 — the 180-day rule (Blueprint B6.4, BACKEND-ARCHITECTURE §8.7): the IP, the device id and the shared
// location an order kept for the risk checks are cleared once the owner's `risk.capture.retentionDays` have passed
// (or the day stored on the order, `piiExpiresAt`, has come — whichever is first, so a shorter rule applies to old
// orders too). Only those four fields change (and the identity graph's IP and device links of PR 519 go); the order,
// its money and its history stay exactly as they are. Every store with orders gets one `orders.pii.purge` per slot of
// `risk.capture.purgeEveryMinutes`; the slot is the run key.
// Review R3 (M1, CN-020 (4)): the same run wipes the voice-address recordings (`checkout.voice.retentionDays`, never
// forever) of checkouts that were abandoned (no order) or whose order is finished: the file is overwritten with
// nothing and its library row archived, the CheckoutVoice row keeps no recording (an abandoned one no words either);
// the order, its history and its audit lines stay, and each wipe is written to the audit log.
// S14 · PR 302 (Blueprint B5.6 V2, §59 answer 50): customers are never removed on their own — no job deletes or
// anonymises a customer (the guard test `retention.test.ts` keeps it so); erasing one stays a person's step (PR 382,
// the owner alone). Only the internet address and the location expire: the same run, by the same days, also clears
// the IP that a customer's sign-in, a one-time code, a bulk enquiry and a consent answer kept. The rows themselves stay
// (the consent answer, its time and channel are the record; the staff sign-in log is the security record, not here).
// S13 · PR 274 (Blueprint C6.3: "drafts are deleted on the retention schedule like any other personal data"): the same
// run wipes what an unfinished checkout kept (name, phone, e-mail, address, the typed extras and the team's note) once
// the owner's `checkout.capture.keepDays` have passed since its last word. The row stays (its time, step and bag link
// are the count of Orders › Incomplete), no order is touched.
// This module imports `./keys`, never `./scheduler` (the scheduler imports the catalogue, which imports this).
import { Prisma, type PrismaClient } from '@extas/db/client';
import { nowOf, type JobDeps } from './context';
import { runKey, slotOf } from './keys';
import type { Planner } from './worker';

export const PII_PURGE_JOB = 'orders.pii.purge';
export const PII_QUEUE = 'privacy';

const DAY = 86_400_000;
const MINUTE = 60_000;

/** The four fields cleared, and the orders still holding any of them. */
const CLEARED = { ip: null, deviceId: null, gpsLat: null, gpsLng: null, piiExpiresAt: null } as const;
const HOLDS_ANY = [{ ip: { not: null } }, { deviceId: { not: null } }, { gpsLat: { not: null } }, { gpsLng: { not: null } }, { piiExpiresAt: { not: null } }];

/**
 * Clears the kept facts of one store's orders past the owner's days. Safe to run twice (a cleared order matches no
 * more). PR 519: the identity graph's IP and device links go with them (the same day rule); its phone, name and
 * address links stay, as the order's own fields do.
 */
export async function purgeOrderPii(db: Pick<PrismaClient, 'order' | 'identityLink'>, storeId: number, now: Date, retentionDays: number): Promise<{ cleared: number; links: number; before: string }> {
  const before = new Date(now.getTime() - retentionDays * DAY);
  const r = await db.order.updateMany({
    where: { storeId, AND: [{ OR: [{ piiExpiresAt: { lte: now } }, { placedAt: { lt: before } }] }, { OR: HOLDS_ANY }] },
    data: CLEARED,
  });
  const links = await db.identityLink.deleteMany({ where: { storeId, kind: { in: ['IP', 'DEVICE'] }, OR: [{ expiresAt: { lte: now } }, { firstSeenAt: { lt: before } }] } });
  return { cleared: r.count, links: links.count, before: before.toISOString() };
}

/** PR 302 — the other places a customer's IP is kept, cleared by the same days. */
export interface CustomerIpsCleared {
  sessions: number;
  codes: number;
  enquiries: number;
  consents: number;
}

/**
 * PR 302 — clears the IP kept by one store's customer sign-ins, one-time codes, bulk enquiries and consent answers
 * older than `retentionDays` (the IP is written once, when the row is made). Only that field changes; no row is
 * removed. Safe to run twice (a cleared row matches no more).
 */
export async function purgeCustomerIps(db: Pick<PrismaClient, 'customerSession' | 'otpChallenge' | 'bulkEnquiry' | 'consentRecord'>, storeId: number, now: Date, retentionDays: number): Promise<CustomerIpsCleared> {
  const where = { storeId, ip: { not: null }, createdAt: { lt: new Date(now.getTime() - retentionDays * DAY) } };
  const data = { ip: null };
  const [sessions, codes, enquiries, consents] = await Promise.all([
    db.customerSession.updateMany({ where, data }),
    db.otpChallenge.updateMany({ where, data }),
    db.bulkEnquiry.updateMany({ where, data }),
    db.consentRecord.updateMany({ where, data }),
  ]);
  return { sessions: sessions.count, codes: codes.count, enquiries: enquiries.count, consents: consents.count };
}

/** An order whose checkout is finished: nothing more happens to its parcel (a recording is no longer needed). */
export const VOICE_DONE_STATES = ['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED'] as const;
/** The library folder of the recordings (apps/web lib/shop/voice.ts VOICE_FOLDER). */
const VOICE_FOLDER = 'voice';
/** Recordings wiped in one run at most (the next run takes the rest). */
const VOICE_BATCH = 500;

/**
 * Review R3 (M1) — wipes one store's voice-address recordings older than `retentionDays` whose checkout was abandoned
 * (no order) or whose order is finished. Safe to run twice (a wiped row has nothing left to wipe).
 */
export async function purgeVoice(deps: Pick<JobDeps, 'db' | 'voice'>, storeId: number, now: Date, retentionDays: number): Promise<{ wiped: number; files: number; before: string }> {
  const db = deps.db;
  const before = new Date(now.getTime() - retentionDays * DAY);
  const rows = await db.checkoutVoice.findMany({
    where: { storeId, createdAt: { lt: before }, OR: [{ assetId: { not: null } }, { orderId: null, transcript: { not: null } }] },
    orderBy: { createdAt: 'asc' },
    take: VOICE_BATCH,
    select: { id: true, orderId: true, assetId: true, transcript: true },
  });
  const orderIds = [...new Set(rows.flatMap((r) => (r.orderId ? [r.orderId] : [])))];
  const done = new Set(orderIds.length ? (await db.order.findMany({ where: { storeId, id: { in: orderIds }, status: { in: [...VOICE_DONE_STATES] } }, select: { id: true } })).map((o) => o.id) : []);
  let wiped = 0;
  let files = 0;
  for (const r of rows) {
    if (r.orderId && !done.has(r.orderId)) continue;
    const asset = r.assetId ? await db.mediaAsset.findFirst({ where: { id: r.assetId, storeId, folder: VOICE_FOLDER }, select: { id: true, storage: true, storageKey: true, mimeType: true, archivedAt: true } }) : null;
    let fileWiped = false;
    if (asset && deps.voice) {
      await deps.voice.wipe(storeId, { storage: asset.storage, storageKey: asset.storageKey, mimeType: asset.mimeType });
      fileWiped = true;
      files++;
    }
    await db.$transaction(async (tx) => {
      if (asset && !asset.archivedAt) await tx.mediaAsset.update({ where: { id: asset.id }, data: { archivedAt: now } });
      await tx.checkoutVoice.update({ where: { id: r.id }, data: { assetId: null, ...(r.orderId ? {} : { transcript: null }) } });
      await tx.auditLog.create({
        data: {
          storeId,
          actorType: 'SYSTEM',
          action: 'checkout.voice.purge',
          entityType: 'CheckoutVoice',
          entityId: r.id,
          before: { assetId: r.assetId, orderId: r.orderId, transcript: r.transcript ? 'kept' : null } as Prisma.InputJsonValue,
          after: { assetId: null, fileWiped, assetArchived: !!asset, transcript: r.orderId ? (r.transcript ? 'kept' : null) : null, retentionDays } as Prisma.InputJsonValue,
        },
      });
    });
    wiped++;
  }
  return { wiped, files, before: before.toISOString() };
}

/**
 * PR 274 — wipes the kept words of one store's checkout drafts whose last word is older than `keepDays` (ordered or
 * not: an order keeps its own copy). Safe to run twice (a wiped draft holds nothing more).
 */
export async function purgeCheckoutDrafts(db: Pick<PrismaClient, 'checkoutDraft'>, storeId: number, now: Date, keepDays: number): Promise<{ wiped: number; keepDays: number }> {
  const holds = [{ phone: { not: null } }, { name: { not: null } }, { email: { not: null } }, { addressText: { not: null } }, { handledNote: { not: null } }, { data: { not: Prisma.DbNull } }];
  const r = await db.checkoutDraft.updateMany({
    where: { storeId, lastActivityAt: { lt: new Date(now.getTime() - keepDays * DAY) }, OR: holds },
    data: { phone: null, name: null, email: null, addressText: null, areaId: null, handledNote: null, data: Prisma.DbNull },
  });
  return { wiped: r.count, keepDays };
}

/** One store's purge, with the owner's days read when it runs. */
export async function runPiiPurge(deps: JobDeps, storeId: number): Promise<{ cleared: number; links: number; before: string; retentionDays: number; customers: CustomerIpsCleared; voice: { wiped: number; files: number; retentionDays: number }; drafts: { wiped: number; keepDays: number } }> {
  const [cap, voiceCfg, draftDays] = await Promise.all([deps.settings.value('risk.capture', { storeId }), deps.settings.value('checkout.voice', { storeId }), deps.settings.value('checkout.capture.keepDays', { storeId })]);
  const now = nowOf(deps);
  const voiceDays = voiceCfg.retentionDays ?? 30; // hardcode-ok: a value saved before v142 reads as the registry default
  const v = await purgeVoice(deps, storeId, now, voiceDays);
  const customers = await purgeCustomerIps(deps.db, storeId, now, cap.retentionDays);
  const drafts = await purgeCheckoutDrafts(deps.db, storeId, now, draftDays);
  return { ...(await purgeOrderPii(deps.db, storeId, now, cap.retentionDays)), retentionDays: cap.retentionDays, customers, voice: { wiped: v.wiped, files: v.files, retentionDays: voiceDays }, drafts };
}

/** Each live store: one purge per slot of its `purgeEveryMinutes`. */
export const piiPlanner: Planner = async (deps, now) => {
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const s of stores) {
    const cap = await deps.settings.value('risk.capture', { storeId: s.id });
    const payload = { storeId: s.id };
    out.push({ queue: PII_QUEUE, name: PII_PURGE_JOB, payload, key: runKey(PII_PURGE_JOB, payload, slotOf(now.getTime(), cap.purgeEveryMinutes * MINUTE)) });
  }
  return out;
};
