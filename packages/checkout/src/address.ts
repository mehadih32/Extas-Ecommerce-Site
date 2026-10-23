// PR 117 — the checkout reads the delivery address with the national gazetteer of S06 (PR 549–553): every place named
// in the line, the longest name first ("Mirpur 12" beats "Mirpur"), a district or postcode anywhere in the line
// settling the band silently. Nothing is read from a line still being typed: the page sends the line only once it is
// finished (the settle controller of @extas/delivery: a pause or leaving the box). The read is the server's own, with
// the same function the order uses (quoteLine), so the place and band the page shows are the ones the order keeps.
// PR 561 — the silent address backfill (`checkout.address.backfill`, off until the owner turns it on): a line nothing
// settles, with no band chosen, and a phone number the shop already knows → the band comes from the address the shop
// holds (@extas/delivery heldAddress) and nothing is asked. Nothing of the held address reaches the page: it shows the
// band and the charge only, never the place. What he typed stays as he typed it; when his line names no place at all,
// the full held address is attached to the order for packing. A line that settles a place itself always wins.
import { heldAddress, quoteLine, type DeliveryDeps, type LineQuote, type PlaceView, type ResolveView } from '@extas/delivery';
import { z } from 'zod';
import { CheckoutError, parse, type CheckoutDeps } from './context';

/** What the page sends about the address: the finished line, and the band the customer chose when he was asked. */
export interface AddressInput {
  line: string;
  /** The band (and place) the customer picked himself (PR 118); kept until he changes it. */
  confirmed?: { bandId: string; areaId?: string | null } | null;
  /** PR 561: the phone number typed so far (sent only while the owner has the backfill on). */
  phone?: string | null;
}

const id = z.string().trim().min(1).max(64);
export const addressInputSchema = z
  .object({
    line: z.string().max(2_000),
    confirmed: z.object({ bandId: id, areaId: id.nullable().optional() }).strict().nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
  })
  .strict();

/** The delivery engine's dependencies, from the checkout's. */
export const deliveryDeps = (deps: CheckoutDeps): DeliveryDeps => ({ db: deps.db, settings: deps.settings, now: deps.now, gazetteer: deps.gazetteer });

/** The address as the checkout read it: nothing yet, the place and band found, or the question to ask. */
export type AddressRead =
  | { status: 'none' }
  | { status: 'resolved'; line: LineQuote & { status: 'resolved' }; read: ResolveView & { status: 'resolved' }; backfill?: Backfill | null }
  | { status: 'ask'; read: ResolveView & { status: 'ask' } };

/** PR 561: the full address the shop holds, attached to the order for packing (never shown on the page). */
export interface Backfill {
  line: string;
  from: 'saved' | 'order';
}

/** How long a line the resolver takes (`delivery.resolver.maxChars`); the address box is capped to it. */
export const addressMaxChars = (deps: CheckoutDeps, storeId: number) => deps.settings.value('delivery.resolver.maxChars', { storeId });

/** Reads a finished address line for a store. An empty line is "nothing yet"; a line over the limit is refused. */
export async function readAddress(deps: CheckoutDeps, storeId: number, input: AddressInput | null | undefined, ctx: { ip?: string | null } = {}): Promise<AddressRead> {
  if (!input) return { status: 'none' };
  const d = parse(addressInputSchema, input, 'address');
  const line = d.line.trim();
  if (!line && !d.confirmed) return { status: 'none' };
  if (line.length > (await addressMaxChars(deps, storeId))) throw new CheckoutError('INVALID_INPUT', 'the address is too long', ['address.line']);
  const q = await quoteLine(deliveryDeps(deps), storeId, { line, confirmed: d.confirmed ?? null });
  if (q.status === 'resolved' && q.read.status === 'resolved') return { status: 'resolved', line: q, read: q.read };
  if (q.read.status === 'ask') {
    const silent = line && !d.confirmed && d.phone ? await backfillRead(deps, storeId, line, d.phone, q.read.reason, ctx.ip ?? null) : null;
    return silent ?? { status: 'ask', read: q.read };
  }
  return { status: 'none' };
}

/** PR 561: the line read again with the place of the address the shop holds for this number; null when that settles nothing. */
async function backfillRead(deps: CheckoutDeps, storeId: number, line: string, phone: string, reason: string, ip: string | null): Promise<AddressRead | null> {
  const cfg = await deps.settings.value('checkout.address.backfill', { storeId });
  if (!cfg.enabled) return null;
  const held = await heldAddress(deliveryDeps(deps), storeId, phone, { orders: cfg.orders, ip });
  if (!held) return null;
  const q = await quoteLine(deliveryDeps(deps), storeId, { line, savedAreaId: held.areaId, confirmed: null });
  if (q.status !== 'resolved' || q.read.status !== 'resolved' || q.read.via !== 'saved') return null;
  // his line named no place at all: the held address is the only one there is — attached for packing
  return { status: 'resolved', line: q, read: q.read, backfill: reason === 'no-place' ? { line: held.line, from: held.from } : null };
}

/** A place as the page names it: "Mirpur 12 · Dhaka" (its own name and the district that tells it apart). */
export interface PlaceName {
  /** The gazetteer place (what the customer's choice names when he picks it). */
  id: string;
  nameEn: string;
  nameBn: string | null;
  parentEn: string | null;
  parentBn: string | null;
}

export const placeName = (p: PlaceView | null): PlaceName | null => (p ? { id: p.id, nameEn: p.nameEn, nameBn: p.nameBn, parentEn: p.parentEn, parentBn: p.parentBn } : null);
