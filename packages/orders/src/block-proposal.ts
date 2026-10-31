// S06 · PR 523 — the block register, and the proposal that fills it (Blueprint S06, 18 Oct: "after N rejections the
// identity is *proposed* for blocking, never blocked automatically … A human blocks; the AI only asks").
//
// A rejection is a parcel refused at the door (counted the way the phone history counts it: never the shop's fault,
// never a try-on re-shipped in another size) or an order cancelled with one of the owner's counted cancel codes
// (`risk.blockProposal.cancelCodes`; "the phone's owner never ordered" never counts). The person is the number and every
// number the identity graph (PR 519) put with it, merged identities included.
//
// While `risk.blockProposal` is on and the owner has set the number, an order that lands from a person with at least that
// many rejections — and not on the blocklist already — proposes the number (one RiskBlockProposal row per number) with
// what the register holds: the numbers, the names and addresses given, every product ordered with its date (the newest
// orders). The order gets a "Proposed for blocking" mark and a timeline line, and goes on exactly as before: never held,
// cancelled or told anything. On Orders › Risk rules a person (`risk.block`) blocks the number (blocklist.ts writes the
// listing with the same facts) or says "Not now" with a reason; a number dismissed, or unblocked later, is proposed
// again only after a new rejection. Nothing here blocks anyone by itself (CLAUDE.md rule 6).
import type { Prisma } from '@extas/db/client';
import { phoneNormalizeBD } from '@extas/delivery';
import { nowOf, setting, TX, type Db, type OrdersDeps } from './context';
import { isOrdersError } from './errors';
import { clusterFamily, clusterOfOrder } from './identity-family';
import { historyOptions, pastOrdersOf, phoneForms } from './phone-history';
import { summarizeHistory } from './phone-summary';
import { execute, systemBy, type By } from './service';

/** The order flag of an order whose number was proposed for the blocklist (the team's screens show it, never the customer). */
export const BLOCK_PROPOSED_FLAG = 'BLOCK_PROPOSED';
/** The timeline type of the proposal written on an order. */
export const BLOCK_PROPOSAL_EVENT = 'order.blockProposal';
/** A proposal's states. */
export const BLOCK_PROPOSAL_STATES = ['PROPOSED', 'BLOCKED', 'DISMISSED'] as const;
export type BlockProposalState = (typeof BLOCK_PROPOSAL_STATES)[number];
/** How many of the person's newest orders the register keeps, with their products. */
const FACT_ORDERS = 50;
/** How many open proposals, and how many decided ones (the newest), the screen shows. */
const PROPOSALS_SHOWN = 100;
const DECIDED_SHOWN = 50;

/** What the register holds about a person. */
export interface RegisterFacts {
  phones: string[];
  names: string[];
  addresses: string[];
  orders: { number: string; placedAt: string; status: string; lines: { name: string; colour: string | null; size: string | null; qty: number }[] }[];
}

export interface BlockProposalRow {
  id: string;
  phone: string;
  state: BlockProposalState;
  rejections: number;
  refused: number;
  declined: number;
  identity: boolean;
  lastOrderId: string | null;
  lastOrderNumber: string | null;
  facts: RegisterFacts;
  proposedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionReason: string | null;
}

const e164 = (raw: string | null | undefined): string | null => {
  const p = raw ? phoneNormalizeBD(raw) : null;
  return p?.ok ? p.e164 : null;
};

const FACT_SELECT = { id: true, number: true, placedAt: true, status: true, totalMinor: true, cancelReasonCode: true, areaId: true, phone: true, customerName: true, shippingAddressText: true } as const;
type FactOrder = Prisma.OrderGetPayload<{ select: typeof FACT_SELECT }>;

/** The person's orders, newest first (at most `take`): by the number's forms, and by every identity of the family. */
export async function personOrders(db: Db, storeId: number, phone: string | null, family: readonly string[], take: number): Promise<FactOrder[]> {
  const linked = family.length ? (await db.identityLink.findMany({ where: { storeId, clusterId: { in: [...family] } }, select: { orderId: true } })).flatMap((l) => (l.orderId ? [l.orderId] : [])) : [];
  const forms = phoneForms(phone);
  const or: Prisma.OrderWhereInput[] = [...(forms.length ? [{ phone: { in: forms } }] : []), ...(linked.length ? [{ id: { in: linked } }] : [])];
  if (!or.length || take <= 0) return [];
  return db.order.findMany({ where: { storeId, status: { not: 'DRAFT' }, archivedAt: null, OR: or }, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], take, select: FACT_SELECT });
}

/** What the register holds, from the person's orders (newest first): the numbers, names, addresses and products with dates. */
export async function registerFacts(db: Db, rows: readonly FactOrder[]): Promise<RegisterFacts> {
  const top = rows.slice(0, FACT_ORDERS);
  const items = top.length ? await db.orderItem.findMany({ where: { orderId: { in: top.map((o) => o.id) } }, orderBy: [{ id: 'asc' }], select: { orderId: true, productName: true, colourName: true, sizeLabel: true, quantity: true } }) : [];
  const distinct = (xs: (string | null)[]) => [...new Set(xs.map((x) => x?.trim() ?? '').filter(Boolean))];
  return {
    phones: distinct(top.map((o) => e164(o.phone) ?? o.phone)),
    names: distinct(top.map((o) => o.customerName)),
    addresses: distinct(top.map((o) => o.shippingAddressText)),
    orders: top.map((o) => ({
      number: o.number,
      placedAt: o.placedAt.toISOString(),
      status: o.status,
      lines: items.filter((i) => i.orderId === o.id).map((i) => ({ name: i.productName, colour: i.colourName, size: i.sizeLabel, qty: i.quantity })),
    })),
  };
}

/** A person's rejections: refused parcels (as the phone history counts them) and the owner's counted cancels. */
export async function rejectionsOf(deps: OrdersDeps, storeId: number, rows: readonly FactOrder[], cancelCodes: readonly string[]): Promise<{ rejections: number; refused: number; declined: number }> {
  const opts = await historyOptions(deps, storeId);
  const s = summarizeHistory(await pastOrdersOf(deps, storeId, rows), { ourFault: opts.ourFault, cancelCodes: new Set(cancelCodes) });
  return { rejections: s.refused + s.cancelsCounted, refused: s.refused, declined: s.cancelsCounted };
}

const isFacts = (v: unknown): v is RegisterFacts => !!v && typeof v === 'object' && Array.isArray((v as RegisterFacts).orders);
/** Facts read back from a row (an older or broken value reads as empty). */
export const registerFactsOf = (v: unknown): RegisterFacts => (isFacts(v) ? v : { phones: [], names: [], addresses: [], orders: [] });

async function staffNames(deps: OrdersDeps, ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map();
  const rows = await deps.db.staffUser.findMany({ where: { id: { in: want } }, select: { id: true, displayName: true } });
  return new Map(rows.map((r) => [r.id, r.displayName]));
}

/** The open proposals (newest first) and the newest decided ones, for the blocklist card. */
export async function blockProposalRows(deps: OrdersDeps, storeId: number): Promise<{ open: BlockProposalRow[]; decided: BlockProposalRow[] }> {
  const [open, decided] = await Promise.all([
    deps.db.riskBlockProposal.findMany({ where: { storeId, state: 'PROPOSED' }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: PROPOSALS_SHOWN }),
    deps.db.riskBlockProposal.findMany({ where: { storeId, state: { not: 'PROPOSED' } }, orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }], take: DECIDED_SHOWN }),
  ]);
  const all = [...open, ...decided];
  const [names, orders] = await Promise.all([
    staffNames(
      deps,
      all.map((r) => r.decidedById),
    ),
    deps.db.order.findMany({ where: { storeId, id: { in: all.map((r) => r.lastOrderId).filter((x): x is string => !!x) } }, select: { id: true, number: true } }),
  ]);
  const numbers = new Map(orders.map((o) => [o.id, o.number]));
  const row = (r: (typeof all)[number]): BlockProposalRow => ({
    id: r.id,
    phone: r.phone,
    state: r.state as BlockProposalState,
    rejections: r.rejections,
    refused: r.refused,
    declined: r.declined,
    identity: !!r.clusterId,
    lastOrderId: r.lastOrderId,
    lastOrderNumber: r.lastOrderId ? (numbers.get(r.lastOrderId) ?? null) : null,
    facts: registerFactsOf(r.facts),
    proposedAt: r.updatedAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
    decidedBy: r.decidedById ? (names.get(r.decidedById) ?? null) : null,
    decisionReason: r.decisionReason,
  });
  return { open: open.map(row), decided: decided.map(row) };
}

/** A proposal's state and counts, for the order screen (its band shows only while the proposal is open). */
export async function blockProposalState(deps: Pick<OrdersDeps, 'db'>, storeId: number, id: string): Promise<{ id: string; state: BlockProposalState; rejections: number; refused: number; declined: number } | null> {
  const r = await deps.db.riskBlockProposal.findFirst({ where: { storeId, id }, select: { id: true, state: true, rejections: true, refused: true, declined: true } });
  return r ? { ...r, state: r.state as BlockProposalState } : null;
}

export interface BlockProposed {
  proposalId: string;
  rejections: number;
  refused: number;
  declined: number;
}

/**
 * The look-up the moment an order lands (switch on, number set): a person with enough rejections, not on the blocklist,
 * has the number proposed (once per order) and the order marked. Off, unset, too few, listed already, or decided with
 * no new rejection since: null. Never blocks, holds, cancels or tells the customer.
 */
export async function blockProposalOnOrder(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By = systemBy('blockProposal')): Promise<BlockProposed | null> {
  const cfg = await setting(deps, ref.storeId, 'risk.blockProposal');
  if (!cfg.enabled || cfg.minRejections === null) return null;
  const order = await deps.db.order.findFirst({ where: { storeId: ref.storeId, id: ref.orderId }, select: { phone: true } });
  const phone = e164(order?.phone);
  if (!phone) return null;
  const clusterId = await clusterOfOrder(deps.db, ref.storeId, ref.orderId);
  const family = clusterId ? await clusterFamily(deps.db, ref.storeId, clusterId) : [];
  // on the blocklist already (the number or the identity): the blocklist's own mark says so
  const listed: Prisma.RiskBlockWhereInput[] = [{ phone }, ...(family.length ? [{ clusterId: { in: family } }] : [])];
  if (await deps.db.riskBlock.findFirst({ where: { storeId: ref.storeId, undoneAt: null, OR: listed }, select: { id: true } })) return null;
  const take = (await historyOptions(deps, ref.storeId)).take;
  const rows = await personOrders(deps.db, ref.storeId, phone, family, take);
  const count = await rejectionsOf(deps, ref.storeId, rows, cfg.cancelCodes);
  if (count.rejections < cfg.minRejections) return null;
  const facts = await registerFacts(deps.db, rows);
  const data = { clusterId, ...count, lastOrderId: ref.orderId, facts: facts as unknown as Prisma.InputJsonValue };
  const proposal = await deps.db.$transaction(async (tx) => {
    // one row per number, so two orders landing at the same moment make one proposal
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`risk-block-proposal:${ref.storeId}:${phone}`}, 0))`;
    const was = await tx.riskBlockProposal.findUnique({ where: { storeId_phone: { storeId: ref.storeId, phone } }, select: { id: true, state: true, rejectionsAtDecision: true } });
    if (!was) return tx.riskBlockProposal.create({ data: { storeId: ref.storeId, phone, state: 'PROPOSED', ...data }, select: { id: true } });
    // a person decided already (dismissed, or blocked and unblocked since): asked again only after a new rejection
    if (was.state !== 'PROPOSED' && was.rejectionsAtDecision !== null && count.rejections <= was.rejectionsAtDecision) return null;
    return tx.riskBlockProposal.update({ where: { id: was.id }, data: { ...data, state: 'PROPOSED', version: { increment: 1 }, updatedAt: nowOf(deps) }, select: { id: true } });
  }, TX);
  if (!proposal) return null;
  try {
    await execute(
      deps,
      ref,
      by,
      {
        command: 'blockProposal',
        input: { proposalId: proposal.id },
        effect: async (tx, o) => {
          const row = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { flags: true } });
          const flags = row.flags.includes(BLOCK_PROPOSED_FLAG) ? row.flags : [...row.flags, BLOCK_PROPOSED_FLAG];
          return { data: { flags }, eventData: { proposalId: proposal.id, ...count }, audit: { before: { flags: row.flags }, after: { flags } } };
        },
      },
      { idempotencyKey: `block-proposal:${ref.orderId}` },
    );
  } catch (e) {
    if (isOrdersError(e) && e.code === 'ILLEGAL_TRANSITION') return null;
    throw e;
  }
  return { proposalId: proposal.id, ...count };
}
