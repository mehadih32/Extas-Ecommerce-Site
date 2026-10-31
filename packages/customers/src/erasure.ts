// S18 · PR 382 — CUS-07 erasure requests (BACKEND-ARCHITECTURE §5.5, decision D9: keep money and stock records,
// anonymise the personal details, nothing deleted). Off until the owner turns on `privacy.erasureRequests`.
//   - A request (`customers.privacy`) names a profile and a reason; it waits, changes nothing.
//   - Only the owner carries one out, with the word from the screen typed in (hard rule 6: irreversible, the owner's
//     own written OK). It is refused while any of the person's orders is still on its way (the courier needs the
//     address); it can be done once they are finished.
//   - Carrying it out, in one transaction: every profile of the person (the survivor and the profiles merged into it)
//     loses its name, numbers, e-mail, birthday and gender, its consents are cleared, it is marked erased and archived;
//     its saved addresses keep only the area (name, number and line cleared, archived); its sign-in is closed (the
//     password replaced by a value nothing matches, every session revoked); his orders (and guest orders with his
//     numbers) keep their lines, money, status and history but lose the name, number, e-mail, address text and the
//     kept device facts; his unfinished checkouts and back-in-stock requests lose their contact details; the identity
//     graph's links of his orders go; the spoken address of his checkouts (CN-020 (4), PR 117: the CheckoutVoice rows of
//     his orders and of the browsers they came from) loses its words and its recording, the recording's library row
//     archived (review R3 M1). An audit row records who and when (never what was erased).
//   - Kept on purpose, and said on the page: the message log and the consent history (the record of what was sent and
//     agreed), the security log, fraud and courier-check records, and money and stock records.
// A request can be cancelled while it waits.
import { audit, isOwner, requirePermission } from '@extas/auth';
import { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { nowOf, parse, setting, TX, UUID, type CustomersDeps, type Who } from './context';
import { CustomersError } from './errors';
import { familyOf, familyOrderWhere, profilesOf } from './family';

export const ERASURE_STATUS = { requested: 'REQUESTED', done: 'DONE', cancelled: 'CANCELLED' } as const;
export type ErasureStatus = (typeof ERASURE_STATUS)[keyof typeof ERASURE_STATUS];

/** Orders still on their way: the courier needs the address, so the person cannot be erased yet. */
export const OPEN_ORDER_STATUSES: Prisma.EnumOrderStatusFilter['in'] = ['DRAFT', 'PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT'];

/** A password hash nothing can match (not the hash format the sign-in checks). */
const CLOSED_PASSWORD = '!erased';

export interface ErasureRow {
  id: string;
  customerId: string;
  reason: string | null;
  status: string;
  requestedById: string | null;
  executedAt: Date | null;
  createdAt: Date;
}

const requestInput = z.object({ customerId: z.string().regex(UUID), reason: z.string().trim().min(1).max(500) }).strict();
const carryInput = z.object({ requestId: z.string().regex(UUID), confirm: z.string().max(100), expected: z.string().min(1).max(100) }).strict();

async function enabled(deps: CustomersDeps, who: Who): Promise<void> {
  if (!(await setting(deps, who.storeId, 'privacy.erasureRequests'))) throw new CustomersError('SWITCHED_OFF', 'erasure requests are switched off', ['privacy.erasureRequests']);
}

/** The store's requests, newest first, at most `limit` (`privacy.requestsListSize`; `customers.privacy`). */
export async function listErasureRequests(deps: CustomersDeps, who: Who, limit: number): Promise<ErasureRow[]> {
  await requirePermission(deps.db, who.actor, 'customers.privacy', { storeId: who.storeId });
  return deps.db.customerErasureRequest.findMany({
    where: { storeId: who.storeId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: Math.min(Math.max(1, limit), 200),
    select: { id: true, customerId: true, reason: true, status: true, requestedById: true, executedAt: true, createdAt: true },
  });
}

/** Files a request for a person (`customers.privacy`); one waiting request per person. Nothing changes yet. */
export async function requestErasure(deps: CustomersDeps, who: Who, input: unknown): Promise<ErasureRow> {
  await requirePermission(deps.db, who.actor, 'customers.privacy', { storeId: who.storeId });
  await enabled(deps, who);
  const v = parse(requestInput, input, 'erasure request');
  const found = await familyOf(deps.db, who.storeId, v.customerId);
  if (!found || found.family.root.erasedAt) throw new CustomersError('NOT_FOUND', 'no such customer', ['customerId']);
  const customerId = found.family.root.id;
  return deps.db.$transaction(async (tx) => {
    const waiting = await tx.customerErasureRequest.findFirst({ where: { storeId: who.storeId, customerId, status: ERASURE_STATUS.requested }, select: { id: true } });
    if (waiting) throw new CustomersError('ALREADY_REQUESTED', 'a request for this person is waiting already', ['customerId'], { requestId: waiting.id });
    const row = await tx.customerErasureRequest.create({
      data: { storeId: who.storeId, customerId, reason: v.reason, status: ERASURE_STATUS.requested, requestedById: who.actor.staffUserId ?? null },
      select: { id: true, customerId: true, reason: true, status: true, requestedById: true, executedAt: true, createdAt: true },
    });
    await audit(tx, who.actor, { storeId: who.storeId, action: 'customer.erasure.request', entityType: 'CustomerErasureRequest', entityId: row.id, after: { customerId } }, who.ctx);
    return row;
  }, TX);
}

/** Cancels a waiting request (`customers.privacy`). */
export async function cancelErasure(deps: CustomersDeps, who: Who, requestId: string): Promise<ErasureRow> {
  await requirePermission(deps.db, who.actor, 'customers.privacy', { storeId: who.storeId });
  if (!UUID.test(requestId)) throw new CustomersError('NOT_FOUND', 'no such request', ['requestId']);
  return deps.db.$transaction(async (tx) => {
    const r = await tx.customerErasureRequest.findFirst({ where: { id: requestId, storeId: who.storeId }, select: { status: true } });
    if (!r) throw new CustomersError('NOT_FOUND', 'no such request', ['requestId']);
    if (r.status !== ERASURE_STATUS.requested) throw new CustomersError('NOT_WAITING', 'this request is not waiting', ['requestId'], { status: r.status });
    const row = await tx.customerErasureRequest.update({
      where: { id: requestId },
      data: { status: ERASURE_STATUS.cancelled },
      select: { id: true, customerId: true, reason: true, status: true, requestedById: true, executedAt: true, createdAt: true },
    });
    await audit(tx, who.actor, { storeId: who.storeId, action: 'customer.erasure.cancel', entityType: 'CustomerErasureRequest', entityId: requestId }, who.ctx);
    return row;
  }, TX);
}

export interface ErasureDone {
  request: ErasureRow;
  profiles: number;
  orders: number;
  addresses: number;
  /** Review R3 (M1): the spoken addresses cleared (their words and recordings). */
  voices: number;
}

/**
 * Carries a waiting request out: the owner only, with the confirmation word typed exactly as the screen showed it
 * (`expected` is that word, from the page's own messages). Irreversible; see the file header for what changes.
 */
export async function carryOutErasure(deps: CustomersDeps, who: Who, input: unknown): Promise<ErasureDone> {
  await requirePermission(deps.db, who.actor, 'customers.privacy', { storeId: who.storeId });
  if (!who.actor.staffUserId || !(await isOwner(deps.db, who.actor.staffUserId))) throw new CustomersError('OWNER_ONLY', 'only the owner can carry out an erasure', ['owner']);
  await enabled(deps, who);
  const v = parse(carryInput, input, 'erasure');
  if (v.confirm.trim() !== v.expected.trim()) throw new CustomersError('CONFIRM_MISMATCH', 'type the confirmation word exactly', ['confirm']);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const req = await tx.customerErasureRequest.findFirst({ where: { id: v.requestId, storeId: who.storeId }, select: { id: true, customerId: true, status: true } });
    if (!req) throw new CustomersError('NOT_FOUND', 'no such request', ['requestId']);
    if (req.status !== ERASURE_STATUS.requested) throw new CustomersError('NOT_WAITING', 'this request is not waiting', ['requestId'], { status: req.status });
    const found = await familyOf(tx, who.storeId, req.customerId);
    if (!found) throw new CustomersError('NOT_FOUND', 'no such customer', ['customerId']);
    const ids = profilesOf(found.family).map((p) => p.id);
    const orderWhere = familyOrderWhere(who.storeId, found.family);
    const open = await tx.order.count({ where: { AND: [orderWhere, { status: { in: OPEN_ORDER_STATUSES } }] } });
    if (open) throw new CustomersError('OPEN_ORDERS', 'an order of this person is still on its way', ['orders'], { open });
    const phones = profilesOf(found.family).flatMap((p) => [p.phone, p.whatsappNumber]).filter((x): x is string => !!x);
    const emails = profilesOf(found.family).map((p) => p.email).filter((x): x is string => !!x);

    const orders = await tx.order.findMany({ where: orderWhere, select: { id: true, visitorId: true } });
    const orderIds = orders.map((o) => o.id);
    const visitorIds = [...new Set(orders.flatMap((o) => (o.visitorId ? [o.visitorId] : [])))];
    if (orderIds.length) {
      await tx.order.updateMany({
        where: { id: { in: orderIds } },
        data: { customerName: null, phone: null, email: null, shippingAddressText: null, backfilledAddress: null, addressResolution: Prisma.DbNull, ip: null, deviceId: null, gpsLat: null, gpsLng: null, piiExpiresAt: null },
      });
      await tx.identityLink.deleteMany({ where: { storeId: who.storeId, orderId: { in: orderIds } } });
    }
    // review R3 (M1): the spoken address — its words and its recording (the library row archived, never deleted)
    const voiceWhere: Prisma.CheckoutVoiceWhereInput = { storeId: who.storeId, OR: [...(orderIds.length ? [{ orderId: { in: orderIds } }] : []), ...(visitorIds.length ? [{ orderId: null, visitorId: { in: visitorIds } }] : [])] };
    const voices = voiceWhere.OR!.length ? await tx.checkoutVoice.findMany({ where: voiceWhere, select: { id: true, assetId: true } }) : [];
    if (voices.length) {
      const assetIds = voices.flatMap((x) => (x.assetId ? [x.assetId] : []));
      if (assetIds.length) await tx.mediaAsset.updateMany({ where: { storeId: who.storeId, id: { in: assetIds }, archivedAt: null }, data: { archivedAt: now } });
      await tx.checkoutVoice.updateMany({ where: { id: { in: voices.map((x) => x.id) } }, data: { transcript: null, assetId: null } });
    }
    const addresses = await tx.customerAddress.updateMany({ where: { storeId: who.storeId, customerId: { in: ids } }, data: { name: '', phone: '', addressLine: '', postcode: null, label: null, isDefault: false, archivedAt: now } });
    await tx.customer.updateMany({
      where: { storeId: who.storeId, id: { in: ids } },
      data: { name: null, phone: null, email: null, whatsappNumber: null, birthday: null, gender: null, genderInferred: false, smsMarketingConsent: null, whatsappMarketingConsent: null, erasedAt: now, archivedAt: now },
    });
    await tx.customerCredential.updateMany({ where: { customerId: { in: ids } }, data: { passwordHash: CLOSED_PASSWORD } });
    await tx.customerSession.updateMany({ where: { customerId: { in: ids }, revokedAt: null }, data: { revokedAt: now } });
    const contact = [...(phones.length ? [{ phone: { in: phones } }] : []), ...(emails.length ? [{ email: { in: emails } }] : []), { customerId: { in: ids } }];
    await tx.checkoutDraft.updateMany({ where: { storeId: who.storeId, OR: contact }, data: { phone: null, name: null, email: null, addressText: null } });
    await tx.backInStockRequest.updateMany({ where: { storeId: who.storeId, OR: contact }, data: { phone: null, email: null } });

    const request = await tx.customerErasureRequest.update({
      where: { id: req.id },
      data: { status: ERASURE_STATUS.done, executedAt: now },
      select: { id: true, customerId: true, reason: true, status: true, requestedById: true, executedAt: true, createdAt: true },
    });
    await audit(tx, who.actor, { storeId: who.storeId, action: 'customer.erasure.done', entityType: 'CustomerErasureRequest', entityId: req.id, after: { profiles: ids.length, orders: orderIds.length, addresses: addresses.count, voices: voices.length } }, who.ctx);
    return { request, profiles: ids.length, orders: orderIds.length, addresses: addresses.count, voices: voices.length };
  }, TX);
}
