// PR 555 — phone-first recognition at checkout. The customer gives his phone number before anything else, and most
// people never log in, so the number is looked up with no login. **A bare phone number prefills the area only** —
// enough to set the charge, and not sensitive. House, road and full address prefill only after a one-time SMS code
// or a real login, so a stranger typing numbers cannot harvest customers' addresses.
// - phoneArea: the number → the area of that customer's default (else latest) saved address, with its band. Never a
//   name, a house, a road, a postcode or an address line. The answer has the same shape whether or not the number is
//   a customer. Each look-up is counted per IP (SecurityEvent `delivery.phone.lookup`, the IP only — never the
//   number); past delivery.phoneFirst.rateLimit in delivery.phoneFirst.rateWindowSeconds it is refused.
// - savedAddressesFor: the full saved addresses, only with proof checked here on the server — a live session of
//   that customer in that store, or an ADDRESS_REVEAL code he has just confirmed for that number.
import type { CustomerAuth } from '@extas/auth';
import { placeView, type PlaceView } from './bands-admin';
import { assertStore, loadBandMap, type DeliveryDeps } from './context';
import { DeliveryError } from './errors';
import { phoneNormalizeBD } from './phone';
import { bandOut, type BandOut } from './resolve-service';

export const PHONE_LOOKUP_EVENT = 'delivery.phone.lookup';

export interface PhoneAreaView {
  /** False when the shop has phone-first recognition switched off (delivery.phoneFirst.enabled). */
  enabled: boolean;
  /** The number said back to the customer (01712-345678). */
  nice: string;
  /** The saved place, for the resolver's `savedAreaId`; null when there is none (or the number is not a customer). */
  savedAreaId: string | null;
  area: PlaceView | null;
  /** The band the place is charged as; null when there is no place or it spans several bands. */
  band: BandOut | null;
}

const clock = (deps: DeliveryDeps) => (deps.now ? deps.now() : new Date());

/** Counts this look-up against its IP; refuses with RATE_LIMITED past the limit. Stores the IP only. */
async function countLookup(deps: DeliveryDeps, storeId: number, ip: string | null): Promise<void> {
  const [limit, windowSeconds] = await Promise.all([deps.settings.value('delivery.phoneFirst.rateLimit'), deps.settings.value('delivery.phoneFirst.rateWindowSeconds')]);
  const now = clock(deps);
  const key = ip ?? 'unknown';
  await deps.db.securityEvent.create({ data: { storeId, kind: PHONE_LOOKUP_EVENT, severity: 'info', details: { ip: key }, createdAt: now } });
  const since = new Date(now.getTime() - windowSeconds * 1000);
  const n = await deps.db.securityEvent.count({ where: { kind: PHONE_LOOKUP_EVENT, createdAt: { gt: since }, details: { path: ['ip'], equals: key } } });
  if (n > limit) throw new DeliveryError('RATE_LIMITED', 'too many phone look-ups', [String(windowSeconds)]);
}

/** The customer with this number in this store, unless erased or archived. */
async function customerOf(deps: DeliveryDeps, storeId: number, e164: string) {
  const c = await deps.db.customer.findUnique({ where: { storeId_phone: { storeId, phone: e164 } }, select: { id: true, erasedAt: true, archivedAt: true } });
  return c && !c.erasedAt && !c.archivedAt ? c : null;
}

/** A bare phone number → the area only (never the address). */
export async function phoneArea(deps: DeliveryDeps, storeId: number, input: unknown, ctx: { ip?: string | null } = {}): Promise<PhoneAreaView> {
  await assertStore(deps, storeId);
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const extra = Object.keys(raw).filter((k) => k !== 'phone');
  if (extra.length || typeof raw.phone !== 'string' || raw.phone.length > 40) throw new DeliveryError('INVALID_INPUT', 'a phone number only', extra.length ? extra : ['phone']);
  const phone = phoneNormalizeBD(raw.phone);
  if (!phone.ok) throw new DeliveryError('INVALID_INPUT', 'not a mobile number', [`phone: ${phone.reason}`]);
  const none: PhoneAreaView = { enabled: true, nice: phone.nice, savedAreaId: null, area: null, band: null };
  if (!(await deps.settings.value('delivery.phoneFirst.enabled', { storeId }))) return { ...none, enabled: false };
  await countLookup(deps, storeId, ctx.ip ?? null);
  const customer = await customerOf(deps, storeId, phone.e164);
  if (!customer) return none;
  const saved = await deps.db.customerAddress.findFirst({
    where: { storeId, customerId: customer.id, archivedAt: null, areaId: { not: null } },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    select: { areaId: true },
  });
  if (!saved?.areaId) return none;
  const map = await loadBandMap(deps, storeId);
  const entry = map.gazetteer.get(saved.areaId);
  if (!entry) return none;
  const answer = map.bandOf(entry);
  return { ...none, savedAreaId: entry.id, area: placeView(map.gazetteer, entry), band: answer && map.spanOf(entry).size === 1 ? bandOut(map, answer.charged) : null };
}

/** Proof that the person at checkout is the customer: his live session, or a code he just confirmed for the number. */
export type AddressProof = { kind: 'session'; auth: CustomerAuth } | { kind: 'otp'; challengeId: string; phone: string };

export interface SavedAddress {
  id: string;
  label: string | null;
  name: string;
  phone: string;
  addressLine: string;
  postcode: string | null;
  isDefault: boolean;
  area: PlaceView | null;
}

/** Whose addresses the proof opens, checked on the server; PROOF_REQUIRED otherwise. */
async function provenCustomer(deps: DeliveryDeps, storeId: number, proof: AddressProof): Promise<string> {
  const now = clock(deps);
  const refuse = (why: string) => new DeliveryError('PROOF_REQUIRED', 'the full address needs a login or a confirmed code', [why]);
  if (proof.kind === 'session') {
    const s = await deps.db.customerSession.findUnique({ where: { id: proof.auth.session.id }, select: { storeId: true, customerId: true, revokedAt: true, expiresAt: true } });
    if (!s || s.storeId !== storeId || s.customerId !== proof.auth.customer.id || s.revokedAt || s.expiresAt <= now) throw refuse('session');
    const c = await deps.db.customer.findUnique({ where: { id: s.customerId }, select: { erasedAt: true, archivedAt: true } });
    if (!c || c.erasedAt || c.archivedAt) throw refuse('session');
    return s.customerId;
  }
  const phone = phoneNormalizeBD(proof.phone);
  const ch = typeof proof.challengeId === 'string' && proof.challengeId.length <= 64 ? await deps.db.otpChallenge.findUnique({ where: { id: proof.challengeId } }).catch(() => null) : null;
  const maxAge = await deps.settings.value('delivery.phoneFirst.otpProofSeconds');
  const fresh = ch?.consumedAt && now.getTime() - ch.consumedAt.getTime() <= maxAge * 1000;
  if (!phone.ok || !ch || ch.storeId !== storeId || ch.purpose !== 'ADDRESS_REVEAL' || ch.phone !== phone.e164 || !fresh) throw refuse('otp');
  const c = await customerOf(deps, storeId, phone.e164);
  if (!c) throw refuse('otp');
  return c.id;
}

/** The customer's full saved addresses — only with proof (a login or a confirmed one-time code). */
export async function savedAddressesFor(deps: DeliveryDeps, storeId: number, proof: AddressProof): Promise<SavedAddress[]> {
  await assertStore(deps, storeId);
  const customerId = await provenCustomer(deps, storeId, proof);
  const rows = await deps.db.customerAddress.findMany({ where: { storeId, customerId, archivedAt: null }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
  const map = await loadBandMap(deps, storeId);
  return rows.map((r) => {
    const e = r.areaId ? map.gazetteer.get(r.areaId) : undefined;
    return { id: r.id, label: r.label, name: r.name, phone: r.phone, addressLine: r.addressLine, postcode: r.postcode, isDefault: r.isDefault, area: e ? placeView(map.gazetteer, e) : null };
  });
}
