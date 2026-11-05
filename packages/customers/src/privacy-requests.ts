// S18 · PR 623 (CN-034; customer 360° finding 6) — the customer's own privacy request, filed into PR 382's list.
// Off until the owner turns on `privacy.customerRequests` — and only while PR 382's `privacy.erasureRequests` is on.
//   - A signed-in customer asks for a copy of his data (COPY) or for its erasure (ERASURE), with an optional note. The
//     request is a CustomerErasureRequest row with `source` CUSTOMER and the kind; it changes nothing. One open request
//     per kind per person (the family's surviving profile): the same tap twice is the same request (a partial unique
//     index backs it, migration 0132).
//   - An erasure is carried out exactly as PR 382 built it (erasure.ts: the owner, the typed word, never while an order
//     is on its way). A copy is prepared only after staff approve it (`customers.privacy`): the request becomes READY,
//     and for the owner's `copyDays` the customer downloads it from his signed-in account (built at that moment from
//     his profiles, addresses, consents and orders). Staff may cancel either kind while it waits.
//   - His account shows the latest request of each kind: received, then its outcome.
// Audited: the customer's request and every download (actorType CUSTOMER, never the data itself), staff approval.
import { requirePermission, audit, type RequestContext } from '@extas/auth';
import { Prisma } from '@extas/db/client';
import { PRIVACY_REQUEST_KINDS, type PrivacyCustomerRequestsSettings, type PrivacyRequestKind } from '@extas/settings';
import { z } from 'zod';
import { checkStoreId, nowOf, parse, setting, TX, UUID, type CustomersDeps, type Db, type Who } from './context';
import { CustomersError } from './errors';
import { ERASURE_STATUS } from './erasure';
import { familyOf, familyOrderWhere, profilesOf } from './family';

/** Who filed a request: staff on the Privacy & data page (PR 382), or the customer from his account (PR 623). */
export const PRIVACY_SOURCE = { staff: 'STAFF', customer: 'CUSTOMER' } as const;
/** A copy request staff approved: ready to download for `copyDays`. */
export const COPY_READY = 'READY';
/** Shown, never stored: an approved copy past its days. */
export const COPY_EXPIRED = 'EXPIRED';

/** The longest note a customer may add (the staff reason's own limit). */
export const PRIVACY_NOTE_MAX = 500;

const DAY = 86_400_000;

export interface CustomerPrivacyRequest {
  id: string;
  kind: PrivacyRequestKind;
  /** REQUESTED, READY, EXPIRED (a copy past its days), DONE or CANCELLED. */
  status: string;
  createdAt: Date;
  decidedAt: Date | null;
  /** A ready copy: the last moment it can be downloaded. */
  readyUntil: Date | null;
}

export interface CustomerPrivacyState {
  rule: PrivacyCustomerRequestsSettings;
  /** The latest request of each offered kind (none: never asked). */
  latest: Partial<Record<PrivacyRequestKind, CustomerPrivacyRequest>>;
}

const ROW = { id: true, kind: true, status: true, createdAt: true, decidedAt: true } as const;
type Row = { id: string; kind: string; status: string; createdAt: Date; decidedAt: Date | null };

/** The owner's rule, or null while either switch is off. */
async function ruleOf(deps: Pick<CustomersDeps, 'settings'>, storeId: number): Promise<PrivacyCustomerRequestsSettings | null> {
  const [erasureOn, rule] = await Promise.all([setting(deps, storeId, 'privacy.erasureRequests'), setting(deps, storeId, 'privacy.customerRequests')]);
  return erasureOn && rule.enabled ? rule : null;
}

function shown(r: Row, rule: PrivacyCustomerRequestsSettings, now: Date): CustomerPrivacyRequest {
  const readyUntil = r.kind === 'COPY' && r.status === COPY_READY && r.decidedAt ? new Date(r.decidedAt.getTime() + rule.copyDays * DAY) : null;
  const status = readyUntil && readyUntil.getTime() < now.getTime() ? COPY_EXPIRED : r.status;
  return { id: r.id, kind: r.kind as PrivacyRequestKind, status, createdAt: r.createdAt, decidedAt: r.decidedAt, readyUntil: status === COPY_READY ? readyUntil : null };
}

/** The person behind a signed-in profile: the family's surviving profile, never an erased one. */
async function personOf(db: Db, storeId: number, customerId: string) {
  if (!UUID.test(customerId)) return null;
  const found = await familyOf(db, storeId, customerId);
  if (!found || found.family.root.erasedAt) return null;
  return found.family;
}

/** What My account › Profile shows (null: the card is not offered). */
export async function customerPrivacyState(deps: CustomersDeps, input: { storeId: number; customerId: string }): Promise<CustomerPrivacyState | null> {
  checkStoreId(input.storeId);
  const rule = await ruleOf(deps, input.storeId);
  if (!rule) return null;
  const family = await personOf(deps.db, input.storeId, input.customerId);
  if (!family) return null;
  const rows = await deps.db.customerErasureRequest.findMany({
    where: { storeId: input.storeId, customerId: family.root.id, kind: { in: [...rule.kinds] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 20,
    select: ROW,
  });
  const now = nowOf(deps);
  const latest: CustomerPrivacyState['latest'] = {};
  for (const r of rows) latest[r.kind as PrivacyRequestKind] ??= shown(r, rule, now);
  return { rule, latest };
}

const askInput = z.object({ kind: z.enum(PRIVACY_REQUEST_KINDS), note: z.string().trim().max(PRIVACY_NOTE_MAX).nullish() }).strict();

const customerAudit = (db: Db, storeId: number, customerId: string, action: string, entityId: string, after: Prisma.InputJsonValue, ctx: RequestContext) =>
  db.auditLog.create({
    data: { storeId, actorType: 'CUSTOMER', actorId: customerId, action, entityType: 'CustomerErasureRequest', entityId, after, ip: ctx.ip?.slice(0, 64) ?? null, userAgent: ctx.userAgent?.slice(0, 512) ?? null, source: 'shop-account' },
  });

const isUniqueClash = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/**
 * Files the signed-in customer's request (`input.customerId` is the session's profile, never one from the request
 * body). Changes nothing else. `again`: an open request of that kind was there already and is the answer.
 */
export async function requestFromCustomer(deps: CustomersDeps, input: { storeId: number; customerId: string; request: unknown }, ctx: RequestContext = {}): Promise<{ request: CustomerPrivacyRequest; again: boolean }> {
  checkStoreId(input.storeId);
  const { storeId } = input;
  const rule = await ruleOf(deps, storeId);
  if (!rule) throw new CustomersError('SWITCHED_OFF', 'privacy requests are switched off', ['privacy.customerRequests']);
  const v = parse(askInput, input.request, 'privacy request');
  if (!rule.kinds.includes(v.kind)) throw new CustomersError('SWITCHED_OFF', 'this kind of request is not offered', ['kind']);
  const family = await personOf(deps.db, storeId, input.customerId);
  if (!family) throw new CustomersError('NOT_FOUND', 'no such customer', ['customer']);
  const customerId = family.root.id;
  const now = nowOf(deps);
  const open = (db: Db) => db.customerErasureRequest.findFirst({ where: { storeId, customerId, kind: v.kind, status: ERASURE_STATUS.requested }, select: ROW });
  try {
    return await deps.db.$transaction(async (tx) => {
      const waiting = await open(tx);
      if (waiting) return { request: shown(waiting, rule, now), again: true };
      const row = await tx.customerErasureRequest.create({
        data: { storeId, customerId, kind: v.kind, source: PRIVACY_SOURCE.customer, reason: v.note || null, status: ERASURE_STATUS.requested, requestedById: null },
        select: ROW,
      });
      await customerAudit(tx, storeId, input.customerId, 'customer.privacy.request', row.id, { kind: v.kind, note: !!v.note }, ctx);
      return { request: shown(row, rule, now), again: false };
    }, TX);
  } catch (e) {
    if (!isUniqueClash(e)) throw e;
    const waiting = await open(deps.db); // two taps at once: the other one filed it
    if (!waiting) throw e;
    return { request: shown(waiting, rule, now), again: true };
  }
}

/** Staff approve a waiting copy request (`customers.privacy`): it becomes READY for the owner's `copyDays`. */
export async function approveCopy(deps: CustomersDeps, who: Who, requestId: string): Promise<void> {
  await requirePermission(deps.db, who.actor, 'customers.privacy', { storeId: who.storeId });
  if (!(await setting(deps, who.storeId, 'privacy.erasureRequests'))) throw new CustomersError('SWITCHED_OFF', 'privacy requests are switched off', ['privacy.erasureRequests']);
  if (!UUID.test(requestId)) throw new CustomersError('NOT_FOUND', 'no such request', ['requestId']);
  const now = nowOf(deps);
  await deps.db.$transaction(async (tx) => {
    const r = await tx.customerErasureRequest.findFirst({ where: { id: requestId, storeId: who.storeId }, select: { kind: true, status: true } });
    if (!r || r.kind !== 'COPY') throw new CustomersError('NOT_FOUND', 'no such copy request', ['requestId']);
    if (r.status !== ERASURE_STATUS.requested) throw new CustomersError('NOT_WAITING', 'this request is not waiting', ['requestId'], { status: r.status });
    await tx.customerErasureRequest.update({ where: { id: requestId }, data: { status: COPY_READY, decidedAt: now, decidedById: who.actor.staffUserId ?? null } });
    await audit(tx, who.actor, { storeId: who.storeId, action: 'customer.privacy.copy.approve', entityType: 'CustomerErasureRequest', entityId: requestId }, who.ctx);
  }, TX);
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * The signed-in customer's copy of his data, while an approved copy request is within its days (else NOT_FOUND).
 * Built now from every profile of the person: the profile facts, saved addresses, offer answers and orders (lines,
 * money, status). Staff notes, risk and device facts are the shop's own records and are not part of it. Audited.
 */
export async function customerDataCopy(deps: CustomersDeps, input: { storeId: number; customerId: string }, ctx: RequestContext = {}): Promise<Record<string, unknown>> {
  checkStoreId(input.storeId);
  const { storeId } = input;
  const state = await customerPrivacyState(deps, input);
  const ready = state?.latest.COPY;
  if (!state || !ready || ready.status !== COPY_READY) throw new CustomersError('NOT_FOUND', 'no copy is ready', ['copy']);
  const family = (await personOf(deps.db, storeId, input.customerId))!;
  const ids = profilesOf(family).map((p) => p.id);
  const [addresses, consents, orders] = await Promise.all([
    deps.db.customerAddress.findMany({ where: { storeId, customerId: { in: ids }, archivedAt: null }, orderBy: { createdAt: 'asc' }, select: { label: true, name: true, phone: true, addressLine: true, postcode: true, isDefault: true, createdAt: true } }),
    deps.db.consentRecord.findMany({ where: { storeId, customerId: { in: ids } }, orderBy: { createdAt: 'asc' }, select: { channel: true, granted: true, scope: true, source: true, createdAt: true } }),
    deps.db.order.findMany({
      where: familyOrderWhere(storeId, family),
      orderBy: { placedAt: 'asc' },
      select: {
        number: true,
        placedAt: true,
        status: true,
        currency: true,
        paymentMethod: true,
        customerName: true,
        phone: true,
        email: true,
        shippingAddressText: true,
        subtotalMinor: true,
        discountMinor: true,
        deliveryChargeMinor: true,
        totalMinor: true,
        deliveredAt: true,
        items: { select: { productName: true, colourName: true, sizeLabel: true, quantity: true, unitPriceMinor: true, lineTotalMinor: true, status: true } },
      },
    }),
  ]);
  await customerAudit(deps.db, storeId, input.customerId, 'customer.privacy.copy.download', ready.id, { orders: orders.length, addresses: addresses.length }, ctx);
  return {
    madeAt: nowOf(deps).toISOString(),
    profiles: profilesOf(family).map((p) => ({ name: p.name, phone: p.phone, email: p.email, whatsappNumber: p.whatsappNumber, birthday: iso(p.birthday), gender: p.gender, createdAt: iso(p.createdAt), smsOffers: p.smsMarketingConsent, whatsappOffers: p.whatsappMarketingConsent })),
    addresses: addresses.map((a) => ({ ...a, createdAt: iso(a.createdAt) })),
    offerAnswers: consents.map((c) => ({ ...c, createdAt: iso(c.createdAt) })),
    orders: orders.map((o) => ({ ...o, placedAt: iso(o.placedAt), deliveredAt: iso(o.deliveredAt) })),
  };
}
