// S13 · PR 257 (Blueprint C6.2) — server-side event tracking: record a shopper event and send it to the ad platforms.
//
// - Recorded only while `ads.tracking` is on and the event is ticked (a test event from the admin always is). The
//   bag, the checkout and the shop's beacon call `recordEvent`; nothing here ever stops or slows the shopper: every
//   hook catches its own errors, and the send runs after the answer has gone (`defer`).
// - Prices and values are read on the server (the product, the bag line, the order), never taken from the browser.
// - A customer's phone and e-mail are kept and sent only as sha256 hashes, and only while `matchCustomers` is on; the
//   shop's own visitor or customer id goes as a hash too. No name, no address, no IP address.
// - Each ticked platform gets the event through its connection (Keys & connections): the mock until the key is in
//   and its test passed, so nothing leaves the shop before that (A1.3). A failed send is tried again on the next send
//   until the owner's number of attempts; the same event id lets the platform count a repeat once.
// - PR 258: the order's own steps (confirmed, delivered) are recorded here too (lib/tracking/orders.ts), and while a
//   purchase means the delivery each send names the events accordingly (model `adNameOf`).
import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { AD_PLATFORM_CONNECTION, adEventAdapters, createConnections, type AdEventSender, type AdPlatform, type AdUser, type Connections } from '@extas/adapters';
import { Prisma, type PrismaClient } from '@extas/db/client';
import { tickedPlatforms, type TrackingSettings } from '@extas/settings';
import type { Vault } from '@extas/vault';
import { adminDeps } from '../admin-auth';
import type { AppResolver } from '../settings';
import { afterSend, hashEmail, hashId, hashPhone, isOrderStep, records, recordsStep, stillWaiting, toAdEvent, valueOf, waitingFor, withoutContact, EVENT_ID, type AnyTrackingEvent, type Deliveries, type StoredItem } from './model';

export interface TrackingDeps {
  db: PrismaClient;
  resolver: AppResolver;
  vault: Pick<Vault, 'get'> | null;
  /** Runs the send after the answer has gone (next/server `after`); tests run it at once. */
  defer?: (task: () => Promise<unknown>) => void;
  now?: () => Date;
  /** Tests pass their own connections (a stand-in platform). */
  connections?: Connections;
}

/** The app's tracking dependencies, or null without a database. */
export function trackingDeps(): TrackingDeps | null {
  const d = adminDeps();
  return d ? { db: d.db, resolver: d.resolver, vault: d.vault, defer: (task) => after(task) } : null;
}

const nowOf = (d: TrackingDeps) => (d.now ? d.now() : new Date());
/** The longest browser name kept. */
const UA_MAX = 400; // hardcode-ok: a stored text's length, not a business number
/** Events sent in one go (each platform takes far more; this keeps one send short). */
export const SEND_BATCH = 200; // hardcode-ok: a batch size, not a business number
/** Earlier waiting events tried again after each new one, and how long a row rests before it is tried again. */
const RETRY_BATCH = 50; // hardcode-ok: a batch size, not a business number
const RETRY_AFTER_MS = 60_000; // hardcode-ok: a technical resting time between tries

export interface Shopper {
  visitorId?: string | null;
  customerId?: string | null;
  email?: string | null;
  /** In +country form (the order's phone). */
  phone?: string | null;
  userAgent?: string | null;
  /** The platforms' own cookies (`platformCookies`). */
  cookies?: Partial<AdUser>;
}

export interface RecordInput {
  storeId: number;
  /** A shopper's event, or (PR 258) an order step read from the order timeline. */
  name: AnyTrackingEvent;
  /** The id the browser's pixel uses for the same event; one is made when absent or not well formed. */
  eventId?: string | null;
  url: string | null;
  items: StoredItem[];
  /** Defaults to the items' value. */
  valueMinor?: number | null;
  /** Defaults to the store's currency (an order names its own). */
  currency?: string | null;
  orderId?: string | null;
  shopper: Shopper;
  /** The admin's test event: recorded even while tracking is off, sent in the platforms' test mode. */
  test?: boolean;
  /** Which platforms get it (default: the ticked ones). */
  platforms?: readonly AdPlatform[];
  /** PR 258: the user data already made (an order step takes its order's purchase event's); hashes per matching now. */
  user?: AdUser;
  /** PR 258: when it happened (an order step: its timeline time); default now. */
  occurredAt?: Date;
  /** PR 258: record only; the caller sends the whole batch afterwards (the order-step reader). */
  sendLater?: boolean;
}

/** The user data of a shopper: the own id and browser as hashes and names, the contact only while matching is on. */
export function userDataOf(s: TrackingSettings, who: Shopper): AdUser {
  const u: AdUser = { ...(who.cookies ?? {}) };
  const own = who.customerId ?? who.visitorId;
  if (own) u.ext = hashId(own);
  if (who.userAgent) u.ua = who.userAgent.slice(0, UA_MAX);
  if (s.matchCustomers) {
    const em = hashEmail(who.email);
    const ph = hashPhone(who.phone);
    if (em) u.em = em;
    if (ph) Object.assign(u, ph);
  }
  return u;
}

/** Records one event (once per event id) and sends it after the answer; false when it is not recorded. */
export async function recordEvent(deps: TrackingDeps, input: RecordInput): Promise<{ recorded: boolean; id?: string }> {
  const at = { storeId: input.storeId };
  const s = await deps.resolver.value('ads.tracking', at);
  const name = input.name;
  const on = isOrderStep(name) ? recordsStep(s, await deps.resolver.value('ads.deliveredPurchase', at), name, input.test) : records(s, name, input.test);
  if (!on) return { recorded: false };
  const currency = input.currency ?? (await deps.resolver.value('store.currency', at));
  const platforms = input.platforms ?? tickedPlatforms(s);
  const eventId = input.eventId && EVENT_ID.test(input.eventId) ? input.eventId : `${input.name}-${randomUUID()}`;
  let id: string;
  try {
    const row = await deps.db.trackedEvent.create({
      data: {
        storeId: input.storeId,
        eventId,
        name: input.name,
        test: Boolean(input.test),
        url: input.url,
        valueMinor: input.valueMinor !== undefined ? input.valueMinor : valueOf(input.items),
        currency,
        items: input.items as unknown as Prisma.InputJsonValue,
        orderId: input.orderId ?? null,
        userData: (input.user ? (s.matchCustomers ? input.user : withoutContact(input.user)) : userDataOf(s, input.shopper)) as Prisma.InputJsonValue,
        deliveries: waitingFor(platforms) as Prisma.InputJsonValue,
        pending: platforms.length > 0,
        occurredAt: input.occurredAt ?? nowOf(deps),
      },
      select: { id: true },
    });
    id = row.id;
  } catch (e) {
    // the same event id again (a page sent it twice, an order replayed): it counts once
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { recorded: false };
    throw e;
  }
  if (platforms.length && !input.test && !input.sendLater) {
    const task = async () => {
      try {
        await sendEvents(deps, { ids: [id] });
        // and the store's earlier ones still waiting (a failed send, or one lost to a restart), left alone a while
        await sendEvents(deps, { storeId: input.storeId, limit: RETRY_BATCH, idleMs: RETRY_AFTER_MS });
      } catch (err) {
        console.warn(`tracking: a send failed (${err instanceof Error ? err.message.split('\n')[0] : String(err)})`);
      }
    };
    if (deps.defer) deps.defer(task);
    else await task();
  }
  return { recorded: true, id };
}

async function connectionsOf(deps: TrackingDeps): Promise<Connections> {
  if (deps.connections) return deps.connections;
  const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  return createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: adEventAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
}

export interface SendOutcome {
  /** Per platform: how many went to the platform, to its mock, or failed (with the last error). */
  platforms: Partial<Record<AdPlatform, { sent: number; mock: number; failed: number; error?: string; mode?: string }>>;
  events: number;
}

/**
 * Sends the waiting events (these ids, or the oldest waiting ones) to every platform each still waits for. Each row is
 * claimed first (its version), so two sends at once never send the same row twice.
 */
export async function sendEvents(deps: TrackingDeps, o: { ids?: readonly string[]; storeId?: number; limit?: number; idleMs?: number } = {}): Promise<SendOutcome> {
  const idle = o.idleMs ? { updatedAt: { lt: new Date(nowOf(deps).getTime() - o.idleMs) } } : {};
  const rows = await deps.db.trackedEvent.findMany({
    where: { pending: true, ...(o.ids ? { id: { in: [...o.ids] } } : {}), ...(o.storeId ? { storeId: o.storeId } : {}), ...idle },
    orderBy: { occurredAt: 'asc' },
    take: Math.min(o.limit ?? SEND_BATCH, SEND_BATCH),
  });
  const out: SendOutcome = { platforms: {}, events: 0 };
  if (!rows.length) return out;
  const maxOf = new Map<number, number>();
  // PR 258: what a purchase means for each store, read at the send (a change applies to what still waits)
  const meansOf = new Map<number, 'placed' | 'delivered'>();
  for (const sid of new Set(rows.map((r) => r.storeId))) {
    maxOf.set(sid, (await deps.resolver.value('ads.tracking', { storeId: sid })).maxAttempts);
    const dp = await deps.resolver.value('ads.deliveredPurchase', { storeId: sid });
    meansOf.set(sid, dp.on ? dp.purchaseMeans : 'placed');
  }
  // claim: a row changed since it was read is someone else's send
  const mine = [];
  for (const r of rows) {
    const c = await deps.db.trackedEvent.updateMany({ where: { id: r.id, updatedAt: r.updatedAt }, data: { pending: true } });
    if (c.count === 1) mine.push(r);
  }
  out.events = mine.length;
  const orderIds = [...new Set(mine.map((r) => r.orderId).filter((x): x is string => !!x))];
  const numbers = new Map((orderIds.length ? await deps.db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true } }) : []).map((x) => [x.id, x.number]));
  const conns = await connectionsOf(deps);
  const next = new Map(mine.map((r) => [r.id, { ...((r.deliveries ?? {}) as Deliveries) }]));
  const now = nowOf(deps);

  for (const platform of Object.keys(AD_PLATFORM_CONNECTION) as AdPlatform[]) {
    const due = mine.filter((r) => stillWaiting(next.get(r.id)?.[platform], maxOf.get(r.storeId) ?? 1));
    if (!due.length) continue;
    const tally = (out.platforms[platform] ??= { sent: 0, mock: 0, failed: 0 });
    for (const sid of new Set(due.map((r) => r.storeId))) {
      for (const test of [false, true]) {
        const group = due.filter((r) => r.storeId === sid && r.test === test);
        if (!group.length) continue;
        let result: { ok: true; mode: 'MOCK' | 'LIVE' | 'SANDBOX' } | { ok: false; error: string };
        try {
          const link = await conns.use<AdEventSender>(AD_PLATFORM_CONNECTION[platform].kind, { storeId: sid, provider: AD_PLATFORM_CONNECTION[platform].provider });
          tally.mode = link.mode;
          const r = await link.api.send(
            group.map((g) => toAdEvent(g, g.orderId ? (numbers.get(g.orderId) ?? null) : null, meansOf.get(g.storeId) ?? 'placed')),
            { test },
          );
          result = r.ok ? { ok: true, mode: link.mode } : { ok: false, error: r.error };
        } catch (e) {
          result = { ok: false, error: e instanceof Error ? e.message.split('\n')[0]! : String(e) };
        }
        for (const g of group) {
          const d = next.get(g.id)!;
          d[platform] = afterSend(d[platform], result, now);
        }
        if (result.ok) tally[result.mode === 'MOCK' ? 'mock' : 'sent'] += group.length;
        else {
          tally.failed += group.length;
          tally.error = result.error;
        }
      }
    }
  }
  for (const r of mine) {
    const d = next.get(r.id)!;
    const pending = Object.values(d).some((x) => stillWaiting(x, maxOf.get(r.storeId) ?? 1));
    await deps.db.trackedEvent.update({ where: { id: r.id }, data: { deliveries: d as Prisma.InputJsonValue, pending } });
  }
  return out;
}
