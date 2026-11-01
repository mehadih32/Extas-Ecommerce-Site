// PR 414 follow-up (CN-013 phase 2, owner 1 Nov 2026) — the customer 360° run's database side (tools/gate-c360/run.mjs
// asks; infra/deploy/gate-c360.sh runs it from the live version's migrate image, mounted at
// /repo/packages/jobs/.gate-c360/helper.ts so the workspace packages resolve). One action per call, its answer as one
// JSON line on stdout. It reads only DATABASE_URL (or DATABASE_DIRECT_URL); it never prints a connection string, a code,
// a key or a password.
//   tsx helper.ts guard                               the providers the shop would use: refuses when one is not a mock
//   tsx helper.ts customer '{"phone","name"}'         the GATE TEST customer (made when no order made him yet)
//   tsx helper.ts otp '{"phone","code"}'              the mock SMS inbox: his newest open sign-in code becomes `code`
//   tsx helper.ts deliver '{"number"}'                his order confirmed, packed, handed over and delivered on the mocks
//   tsx helper.ts facts '{"number"|"phone"}'          the order and the customer as the shop stored them
//   tsx helper.ts messages '{"number"}'               the messages planned for the order, each with its words re-drawn
//   tsx helper.ts cleanup '{"phone"}'                 cancels what is still open and archives the gate's rows (with
//                                                     the GATE TEST products)
// Live run 1 Nov (the run found no products, and nothing to pay with): the shared test-data helpers of gate-orders
// (tools/gate-orders/lib/test-shop.ts, mounted at /repo/packages/jobs/.gate-orders) give it its own GATE TEST products
// and its run's mock-payment grant; only the shell asks for these (never the browser through the bridge):
//   tsx helper.ts products '{"run"}'                  the GATE TEST products (one size sold out), with their shop paths
//   tsx helper.ts switches '{}'                       the owner's switches the steps read (never changed here)
//   tsx helper.ts payopen '{"run","hash","host","minutes","cod"}'  the run's grant: the practice gateway for the
//                                                     run's own browser on the preview host (cod "yes": cash on
//                                                     delivery on for the run only, the owner's OK)
//   tsx helper.ts payclose '{"run"}'                  the grant closed and cash on delivery put back (safe twice)
// Every action that writes touches only rows the gate made: a customer or an order whose name starts with the gate's
// mark (GATE TEST), on a number no real customer has. Nothing is deleted, ever: the order service cancels, a row is
// archived. Every write goes through the shop's own services where one exists (the order steps, the cancel).
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SYSTEM } from '@extas/auth';
import { disconnectPrisma, getPrisma, MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { cancelWith, confirmBy, orderStep, type By, type OrdersDeps } from '@extas/orders';
import { orderLink, render, runContext, type MessagesDeps } from '@extas/messages';
import { archiveProducts, closeRuns, openRun, setTestStock, setUpProducts, type Kit, type TestData } from '../.gate-orders/lib/test-shop';

/** The mark every row the gate makes carries (the customer's and the order's name). */
export const GATE_MARK = 'GATE TEST';

/** The kinds of connection a customer's journey can reach: each must be a mock (A1.3). Infrastructure is not asked. */
const CUSTOMER_FACING = ['COURIER', 'SMS', 'EMAIL', 'PAYMENT', 'AI_PROVIDER', 'META', 'GOOGLE', 'TIKTOK', 'WHATSAPP', 'MESSENGER', 'FRAUD_CHECK', 'ERP', 'SPEECH', 'MAPS'];

const BY: By = { actorType: 'SYSTEM', actorId: null, source: 'gate-c360' };
const STORE = MOTHER_STORE_ID;
const isGate = (name: string | null | undefined): boolean => typeof name === 'string' && name.startsWith(GATE_MARK);

type Args = Record<string, unknown>;
const str = (v: unknown, max = 60): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** A Bangladeshi mobile number in +880 form (the gate's numbers are always of this shape). */
function e164(raw: unknown): string {
  const d = str(raw, 20).replace(/\D/g, '');
  const local = d.startsWith('880') ? `0${d.slice(3)}` : d;
  if (!/^01[3-9]\d{8}$/.test(local)) throw new Error('not a gate number');
  return `+88${local}`;
}

/** The order number the gate placed, refused unless the order is the gate's own. */
async function gateOrder(db: PrismaClient, number: unknown) {
  const n = str(number, 40);
  if (!/^[A-Za-z0-9-]{1,40}$/.test(n)) throw new Error('not an order number');
  const o = await db.order.findUnique({ where: { storeId_number: { storeId: STORE, number: n } } });
  if (!o) throw new Error('no such order');
  if (!isGate(o.customerName)) throw new Error('not a gate order (its name does not start with the gate mark)');
  return o;
}

/** The gate's customer by number, refused when the number belongs to someone who is not the gate. */
async function gateCustomer(db: PrismaClient, phone: string) {
  const c = await db.customer.findUnique({ where: { storeId_phone: { storeId: STORE, phone } } });
  if (c && !isGate(c.name)) throw new Error('this number belongs to a real customer: the gate stops');
  return c;
}

async function guard(db: PrismaClient): Promise<Args> {
  const rows = await db.integration.findMany({
    where: { archivedAt: null, enabled: true, mode: { not: 'MOCK' }, kind: { in: CUSTOMER_FACING as never[] } },
    select: { kind: true, provider: true, mode: true },
  });
  const live = rows.map((r) => `${r.kind}/${r.provider} (${r.mode})`);
  return { ok: live.length === 0, live };
}

async function customer(db: PrismaClient, a: Args): Promise<Args> {
  const phone = e164(a.phone);
  const name = str(a.name, 80);
  if (!isGate(name)) throw new Error('the gate customer is named with the gate mark');
  const c = await gateCustomer(db, phone);
  if (c) return { ok: true, made: false, id: c.id };
  const made = await db.customer.create({ data: { storeId: STORE, phone, name, firstSource: 'WEBSITE' }, select: { id: true } });
  return { ok: true, made: true, id: made.id };
}

async function otp(db: PrismaClient, a: Args): Promise<Args> {
  const phone = e164(a.phone);
  const code = str(a.code, 12);
  if (!/^\d{4,8}$/.test(code)) throw new Error('a code is 4–8 digits');
  const c = await gateCustomer(db, phone);
  if (!c) return { ok: false, reason: 'no gate customer on this number yet' };
  const open = await db.otpChallenge.findFirst({ where: { storeId: STORE, phone, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  if (!open) return { ok: false, reason: 'no open sign-in code for this number (was one asked for?)' };
  // the same form packages/accounts codes.ts stores: salt$sha256(salt:code)
  const salt = randomBytes(16).toString('hex');
  const hash = `${salt}$${createHash('sha256').update(`${salt}:${code}`).digest('hex')}`;
  await db.otpChallenge.update({ where: { id: open.id }, data: { codeHash: hash } });
  return { ok: true };
}

async function deliver(deps: OrdersDeps, a: Args): Promise<Args> {
  const o = await gateOrder(deps.db, a.number);
  const r = { storeId: STORE, orderId: o.id };
  const done: string[] = [];
  const at = async () => (await deps.db.order.findUniqueOrThrow({ where: { id: o.id }, select: { status: true } })).status;
  let s = await at();
  if (s === 'PLACED') {
    await confirmBy(deps, r, BY);
    done.push('confirmed');
    s = await at();
  }
  for (const [from, step] of [['CONFIRMED', 'pack'], ['PROCESSING', 'pack'], ['PACKED', 'handover'], ['HANDED_OVER', 'delivered'], ['IN_TRANSIT', 'delivered']] as const) {
    if (s !== from) continue;
    try {
      await orderStep(deps, r, BY, step, { note: `${GATE_MARK}: moved on the mocks by the go-live gate` });
    } catch (e) {
      // booking a parcel is a staff action only (packages/shipping booking.ts): the gate never books as someone
      if ((e as { code?: string }).code === 'NOT_BOOKED') {
        const couriers = await deps.db.courierAccount.count({ where: { storeId: STORE, enabled: true, archivedAt: null } });
        return { ok: false, status: s, done, needsPerson: couriers ? 'a staff member books the parcel (Packing › Hand-over)' : 'no courier is set up yet, and booking is a staff action' };
      }
      throw e;
    }
    done.push(step);
    s = await at();
  }
  return { ok: s === 'DELIVERED', status: s, done };
}

async function facts(db: PrismaClient, a: Args): Promise<Args> {
  const o = a.number ? await gateOrder(db, a.number) : null;
  const phone = o?.phone ?? (a.phone ? e164(a.phone) : null);
  const c = phone ? await gateCustomer(db, phone) : null;
  const [events, shipments, notes] = o
    ? await Promise.all([
        db.orderEvent.findMany({ where: { orderId: o.id }, orderBy: { createdAt: 'asc' }, select: { type: true, toStatus: true, source: true } }),
        db.shipment.findMany({ where: { orderId: o.id }, select: { status: true, trackingCode: true } }),
        db.notificationLog.count({ where: { orderId: o.id } }),
      ])
    : [[], [], 0];
  const drafts = phone ? await db.checkoutDraft.count({ where: { storeId: STORE, phone: { in: [phone, phone.replace('+88', '')] } } }) : 0;
  return {
    ok: true,
    order: o && {
      number: o.number,
      status: o.status,
      totalMinor: o.totalMinor,
      dueMinor: o.totalMinor - o.walletAppliedMinor - o.paidMinor,
      paymentMethod: o.paymentMethod,
      lang: o.lang,
      currency: o.currency,
      source: o.source,
      attribution: { utmSource: o.utmSource, utmMedium: o.utmMedium, utmCampaign: o.utmCampaign, adPlatform: o.adPlatform, referrer: o.referrer },
      placedAt: o.placedAt,
      customerLinked: !!o.customerId,
    },
    events: events.map((e) => `${e.type}${e.toStatus ? `→${e.toStatus}` : ''}`),
    shipments,
    messages: notes,
    drafts,
    customer: c && { id: c.id, orderCount: c.orderCount, deliveredCount: c.deliveredCount, lifetimeValueMinor: c.lifetimeValueMinor, sms: c.smsMarketingConsent, whatsapp: c.whatsappMarketingConsent, archived: !!c.archivedAt },
  };
}

async function messages(deps: OrdersDeps, a: Args): Promise<Args> {
  const o = await gateOrder(deps.db, a.number);
  const rows = await deps.db.notificationLog.findMany({ where: { orderId: o.id }, orderBy: { createdAt: 'asc' } });
  const mdeps: MessagesDeps = { db: deps.db, settings: deps.settings, sender: () => Promise.reject(new Error('the gate never sends')) };
  const c = await runContext(mdeps, STORE);
  const out = [];
  for (const r of rows) {
    const t = r.templateId ? await deps.db.notificationTemplate.findUnique({ where: { id: r.templateId }, select: { body: true, subject: true, locale: true } }) : null;
    const lang = (t?.locale ?? r.locale) === 'en' ? 'en' : 'bn';
    const words = t
      ? render(t.body, r.channel === 'EMAIL' ? (t.subject ?? '') : null, {
          storeName: c.storeName,
          customerName: o.customerName ?? '',
          orderNumber: o.number,
          senderName: '',
          currency: o.currency,
          dueMinor: o.totalMinor - o.walletAppliedMinor - o.paidMinor,
          link: orderLink(c.host, o.number),
          amountLine: c.amountLine[lang],
          exactAmount: c.exact ? { due: c.exact.due[lang], paid: c.exact.paid[lang] } : null,
        })
      : null;
    out.push({
      channel: r.channel,
      step: r.step,
      locale: r.locale,
      status: r.status,
      mode: r.mode,
      provider: r.provider,
      reason: r.reason,
      toOrderPhone: r.recipient === o.phone || r.recipient.replace(/\D/g, '').endsWith((o.phone ?? '-').replace(/\D/g, '').slice(-10)),
      text: words && words.ok ? words.text : null,
    });
  }
  return { ok: true, rows: out };
}

/** The run id the shell gives (letters, digits and dashes). */
const runOf = (a: Args): string => {
  const r = str(a.run, 24);
  if (!/^[A-Za-z0-9-]{1,24}$/.test(r)) throw new Error('not a run id');
  return r;
};

/** The helper's dependencies: the order service's, and the settings resolver itself (the shared helpers write with it). */
type Deps = OrdersDeps & { resolver: Kit['settings'] };

/** The shared helpers' view: the store, its settings, the system actor and this run's audit source. */
const kitOf = (deps: Deps): Kit => ({ db: deps.db, storeId: STORE, settings: deps.resolver, who: { actor: SYSTEM, storeId: STORE, ctx: { source: 'gate-c360', userAgent: 'extas-gate-c360' } }, source: 'gate-c360' });
const testData = (): TestData => JSON.parse(readFileSync(new URL('../.gate-orders/data/test-data.json', import.meta.url), 'utf8')) as TestData;

/** The GATE TEST products, opened for the run; the first one's last size of its first colour sold out (the "tell me" step). */
async function products(deps: Deps, a: Args): Promise<Args> {
  const run = runOf(a);
  const d = testData();
  const k = kitOf(deps);
  const made = await setUpProducts(k, d, run);
  const first = made.products[0];
  const out = first?.variants.filter((v) => v.colour === first.variants[0]?.colour).at(-1);
  if (out) await setTestStock(k, d, run, out.id, 0);
  const prefix = (await deps.settings.value('naming.productPathPrefix', { storeId: STORE })) || '/p';
  return { ok: true, products: made.products.map((p) => ({ key: p.key, path: `${prefix}/${p.slug}`.replace(/\/{2,}/g, '/'), variants: p.variants.length })), soldOut: out ? out.sku : null };
}

/** The owner's switches the steps read, so a step behind one that is off says so (read only). */
async function switches(deps: OrdersDeps): Promise<Args> {
  const v = <K extends Parameters<OrdersDeps['settings']['value']>[0]>(key: K) => deps.settings.value(key, { storeId: STORE });
  const [contact, attribution, chat, cod, test] = await Promise.all([v('pages.contactForm'), v('ads.attribution'), v('support.liveChat'), v('payment.cod.enabled'), v('payments.testPayments')]);
  return { ok: true, contactForm: contact.enabled === true, attribution: attribution.on === true, liveChat: chat.enabled === true, cod: cod === true, testPayments: test === true };
}

async function payopen(deps: Deps, a: Args): Promise<Args> {
  const r = await openRun(kitOf(deps), { runId: runOf(a), tokenHash: str(a.hash, 64), host: str(a.host, 253), minutes: Number(a.minutes) || 0, allowCod: a.cod === 'yes' });
  return { ok: true, ...r };
}

async function payclose(deps: Deps, a: Args): Promise<Args> {
  return { ...(await closeRuns(kitOf(deps), { runId: runOf(a) })) };
}

async function cleanup(deps: Deps, a: Args): Promise<Args> {
  const phone = e164(a.phone);
  const db = deps.db;
  const c = await gateCustomer(db, phone);
  const orders = await db.order.findMany({ where: { storeId: STORE, phone }, select: { id: true, number: true, status: true, customerName: true, archivedAt: true } });
  const done = { cancelled: 0, archivedOrders: 0, archivedReviews: 0, archivedBackInStock: 0, closedOtps: 0, archivedCustomer: false, leftAlone: [] as string[] };
  const now = new Date();
  for (const o of orders) {
    if (!isGate(o.customerName)) {
      done.leftAlone.push(o.number);
      continue;
    }
    if (['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED'].includes(o.status)) {
      await cancelWith(deps, { storeId: STORE, orderId: o.id }, BY, 'OTHER', `${GATE_MARK}: the go-live gate cancels its own test order`, { picked: false });
      done.cancelled++;
    }
    if (!o.archivedAt) {
      await db.order.update({ where: { id: o.id }, data: { archivedAt: now, internalFlags: { push: 'gate-test' } } });
      done.archivedOrders++;
    }
  }
  if (c) {
    done.archivedReviews = (await db.review.updateMany({ where: { storeId: STORE, customerId: c.id, archivedAt: null }, data: { archivedAt: now } })).count;
    if (!c.archivedAt) {
      await db.customer.update({ where: { id: c.id }, data: { archivedAt: now } });
      done.archivedCustomer = true;
    }
  }
  done.archivedBackInStock = (await db.backInStockRequest.updateMany({ where: { storeId: STORE, phone: { in: [phone, phone.replace('+88', '')] }, archivedAt: null }, data: { archivedAt: now } })).count;
  done.closedOtps = (await db.otpChallenge.updateMany({ where: { storeId: STORE, phone, consumedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } })).count;
  // the GATE TEST products archived (never deleted); a later run opens them again
  const archived = await archiveProducts(kitOf(deps), testData(), 'gate-c360');
  return { ok: archived.fails.length === 0, ...done, productsArchived: archived.productsArchived, notes: archived.fails };
}

export async function runAction(action: string, args: Args): Promise<Args> {
  const db = getPrisma();
  const resolver = new SettingsResolver(prismaBackend(db), registry);
  const deps: Deps = { db, settings: resolver, resolver };
  switch (action) {
    case 'guard':
      return guard(db);
    case 'customer':
      return customer(db, args);
    case 'otp':
      return otp(db, args);
    case 'deliver':
      return deliver(deps, args);
    case 'facts':
      return facts(db, args);
    case 'messages':
      return messages(deps, args);
    case 'cleanup':
      return cleanup(deps, args);
    case 'products':
      return products(deps, args);
    case 'switches':
      return switches(deps);
    case 'payopen':
      return payopen(deps, args);
    case 'payclose':
      return payclose(deps, args);
    default:
      throw new Error(`no such action: ${action}`);
  }
}

/** The error in one short line, without anything that looks like a connection string. */
const errLine = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).split('\n').filter(Boolean).slice(-1)[0]!.replace(/[a-z]+:\/\/\S+/gi, '<url>').slice(0, 240);

async function main(argv: string[]): Promise<number> {
  const [action = '', raw = '{}'] = argv;
  if (!process.env.DATABASE_URL && process.env.DATABASE_DIRECT_URL) process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL;
  if (!process.env.DATABASE_URL) {
    console.log(JSON.stringify({ ok: false, error: 'DATABASE_URL is not set' }));
    return 2;
  }
  let args: Args;
  try {
    args = JSON.parse(raw) as Args;
  } catch {
    console.log(JSON.stringify({ ok: false, error: 'the arguments are not JSON' }));
    return 2;
  }
  try {
    console.log(JSON.stringify(await runAction(action, args)));
    return 0;
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: errLine(e) }));
    return 1;
  } finally {
    await disconnectPrisma();
  }
}

if (process.argv[1] && /helper\.ts$/.test(process.argv[1])) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
