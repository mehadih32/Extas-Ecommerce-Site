// S28 · PR 704 (admin prototype v5, GAP-MAP part 1 O-35 / N17; part 3 X5 / N14) — the bulk and corporate orders screen over
// the enquiry PR 606 built: a quote with an agreed price (one price per piece, or a price by quantity), the advance and the
// balance, a company invoice and delivery in batches.
//   - Off until the owner turns `bulk.orders` on; every number (advance percent, days a quote stands, batches, gaps) is a setting.
//   - Money is whole minor units. The total is pieces x the unit price (the unit price is the tier the pieces reach); the advance
//     is a percent of the total rounded to a whole minor unit; the balance is what is left. The printed quotation and invoice
//     show exactly these saved figures.
//   - "Advance received" and "Balance received" are marks put with the owner's PIN. They never move money and never make a
//     Payment row: Money and Accounts own that. The balance mark needs the advance mark and every batch delivered.
//   - Batches: the pieces are split as evenly as whole pieces allow over the chosen count, planned `batchGapDays` apart; a batch
//     moves waiting -> packed -> shipped (with tracking) -> delivered, one step at a time, and only after the advance mark.
//   - Making a quote from an enquiry moves that enquiry to QUOTED; nothing is sent to the company from here.
// Needs `orders.read` (see) and `orders.notes` (make, move, mark), the same keys the enquiry list uses.
import { z } from 'zod';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { storeTarget, type BulkOrdersSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { BATCH_NEXT, figures, splitBatches, stateOf, type BatchStatus, type BulkLine, type BulkTier, type PriceInput, type QuoteState } from './bulk-orders-pure';
import { requireOwnerPin } from './owner-pin';

type Db = PrismaClient;
const DAY_MS = 86_400_000;

/* ---------- pure (bulk-orders-pure.ts) ---------- */
export * from './bulk-orders-pure';

/* ---------- input ---------- */

const name = z.string().trim().min(1).max(120);
const lineSchema = z.object({ name, colour: z.string().trim().max(60).default(''), sizes: z.record(z.string().trim().min(1).max(12), z.number().int().min(0).max(1_000_000)) }).strict();

export const quoteInput = z
  .object({
    enquiryId: z.uuid().nullable().optional(),
    company: name,
    contact: z.string().trim().max(120).default(''),
    phone: z.string().trim().min(5).max(30),
    lines: z.array(lineSchema).min(1).max(60),
    pricing: z.enum(['PIECE', 'TIER']),
    pieceMinor: z.number().int().min(0).max(1_000_000_000).default(0),
    tiers: z.array(z.object({ from: z.number().int().min(0), minor: z.number().int().min(0).max(1_000_000_000) }).strict()).max(12).default([]),
    advancePct: z.number().int().min(0).max(100).optional(),
    batches: z.number().int().min(1).max(12).optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

/* ---------- views ---------- */

export interface QuoteRow {
  id: string;
  ref: string;
  company: string;
  contact: string;
  phone: string;
  lines: BulkLine[];
  pricing: 'PIECE' | 'TIER';
  tiers: BulkTier[];
  advancePct: number;
  pieces: number;
  unitMinor: number;
  totalMinor: number;
  advanceMinor: number;
  balanceMinor: number;
  advanceReceivedAt: string | null;
  balanceReceivedAt: string | null;
  note: string | null;
  createdAt: string;
  validUntil: string;
  state: QuoteState;
  batches: { id: string; no: number; pieces: number; plannedOn: string; status: BatchStatus; tracking: string | null }[];
}

type QuoteDb = Awaited<ReturnType<typeof loadQuotes>>[number];
async function loadQuotes(db: Db, storeId: number, where: Record<string, unknown> = {}) {
  return db.bulkQuote.findMany({ where: { storeId, ...where }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200, include: { batches: { orderBy: { no: 'asc' } } } });
}
const rowOf = (q: QuoteDb, cfg: BulkOrdersSettings): QuoteRow => ({
  id: q.id,
  ref: `${cfg.refPrefix}${q.refNo}`,
  company: q.company,
  contact: q.contact,
  phone: q.phone,
  lines: q.lines as unknown as BulkLine[],
  pricing: q.pricing,
  tiers: q.tiers as unknown as BulkTier[],
  advancePct: q.advancePct,
  pieces: q.pieces,
  unitMinor: q.unitMinor,
  totalMinor: q.totalMinor,
  advanceMinor: q.advanceMinor,
  balanceMinor: q.totalMinor - q.advanceMinor,
  advanceReceivedAt: q.advanceReceivedAt?.toISOString() ?? null,
  balanceReceivedAt: q.balanceReceivedAt?.toISOString() ?? null,
  note: q.note,
  createdAt: q.createdAt.toISOString(),
  validUntil: new Date(q.createdAt.getTime() + cfg.quoteValidDays * DAY_MS).toISOString().slice(0, 10),
  state: stateOf(q, q.batches),
  batches: q.batches.map((b) => ({ id: b.id, no: b.no, pieces: b.pieces, plannedOn: b.plannedOn.toISOString().slice(0, 10), status: b.status, tracking: b.tracking })),
});

export interface BulkView {
  enabled: boolean;
  cfg: BulkOrdersSettings;
  quotes: QuoteRow[];
  enquiries: { id: string; ref: string; name: string; company: string | null; phone: string; quantity: number; itemsText: string | null; status: string }[];
  totals: { open: number; openPieces: number; openMinor: number; balanceToCollectMinor: number };
}

export async function bulkView(deps: Pick<AdminDeps, 'db' | 'resolver'>, storeId: number): Promise<BulkView> {
  const cfg = await deps.resolver.value('bulk.orders', { storeId });
  const lane = await deps.resolver.value('orders.bulkLane', { storeId });
  const [quotes, enq] = await Promise.all([
    loadQuotes(deps.db, storeId),
    deps.db.bulkEnquiry.findMany({ where: { storeId, status: { in: ['NEW', 'CONTACTED'] } }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  const rows = quotes.map((q) => rowOf(q, cfg));
  const open = rows.filter((r) => r.state !== 'DONE');
  return {
    enabled: cfg.enabled,
    cfg,
    quotes: rows,
    enquiries: enq.map((e) => ({ id: e.id, ref: `${lane.refPrefix}${e.refNo}`, name: e.name, company: e.company, phone: e.phone, quantity: e.quantity, itemsText: e.itemsText, status: e.status })),
    totals: {
      open: open.length,
      openPieces: open.reduce((n, r) => n + r.pieces, 0),
      openMinor: open.reduce((n, r) => n + r.totalMinor, 0),
      balanceToCollectMinor: rows.filter((r) => r.advanceReceivedAt && !r.balanceReceivedAt).reduce((n, r) => n + r.balanceMinor, 0),
    },
  };
}

/* ---------- writes ---------- */

type Fail = { ok: false; error: string; details?: string[] };

export async function createQuote(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, raw: unknown): Promise<{ ok: true; id: string } | Fail> {
  const cfg = await deps.resolver.value('bulk.orders', { storeId });
  if (!cfg.enabled) return { ok: false, error: 'SWITCHED_OFF' };
  await requirePermission(deps.db, actor, 'orders.notes', { storeId });
  const p = quoteInput.safeParse(raw);
  if (!p.success) return { ok: false, error: 'INVALID_INPUT', details: p.error.issues.map((i) => i.path.join('.')) };
  const d = p.data;
  const lines = d.lines.map((l) => ({ ...l, sizes: Object.fromEntries(Object.entries(l.sizes).filter(([, n]) => n > 0)) })).filter((l) => Object.keys(l.sizes).length > 0);
  if (!lines.length) return { ok: false, error: 'NO_PIECES' };
  const price: PriceInput = { pricing: d.pricing, pieceMinor: d.pricing === 'PIECE' ? d.pieceMinor : 0, tiers: d.pricing === 'TIER' ? d.tiers : [] };
  if (d.pricing === 'TIER' && !d.tiers.length) return { ok: false, error: 'INVALID_INPUT', details: ['tiers'] };
  const advancePct = d.advancePct ?? cfg.defaultAdvancePct;
  const f = figures(lines, price, advancePct);
  if (f.unitMinor <= 0) return { ok: false, error: 'NO_PRICE' };
  const count = Math.min(d.batches ?? 1, cfg.maxBatches);
  const now = deps.now ? deps.now() : new Date();
  const id = await deps.db.$transaction(async (tx) => {
    // numbering under the store's own lock, as the enquiries do
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${704}::int, ${storeId}::int)`;
    if (d.enquiryId) {
      const e = await tx.bulkEnquiry.findFirst({ where: { id: d.enquiryId, storeId }, select: { id: true } });
      if (!e) throw Object.assign(new Error('ENQUIRY_NOT_FOUND'), { code: 'ENQUIRY_NOT_FOUND' });
    }
    const last = await tx.bulkQuote.aggregate({ where: { storeId }, _max: { refNo: true } });
    const q = await tx.bulkQuote.create({
      data: {
        storeId,
        refNo: (last._max.refNo ?? 1000) + 1,
        enquiryId: d.enquiryId ?? null,
        company: d.company,
        contact: d.contact,
        phone: d.phone,
        lines: lines as unknown as object,
        pricing: d.pricing,
        pieceMinor: price.pieceMinor,
        tiers: price.tiers as unknown as object,
        advancePct,
        pieces: f.pieces,
        unitMinor: f.unitMinor,
        totalMinor: f.totalMinor,
        advanceMinor: f.advanceMinor,
        note: d.note ?? null,
        createdById: actor.staffUserId ?? null,
      },
    });
    for (const b of splitBatches(f.pieces, count, now, cfg.firstBatchAfterDays, cfg.batchGapDays)) await tx.bulkBatch.create({ data: { storeId, quoteId: q.id, no: b.no, pieces: b.pieces, plannedOn: new Date(`${b.plannedOn}T00:00:00.000Z`) } });
    if (d.enquiryId) await tx.bulkEnquiry.update({ where: { id: d.enquiryId }, data: { status: 'QUOTED' } });
    await audit(tx, actor, { action: 'bulkQuote.create', entityType: 'BulkQuote', entityId: q.id, before: null, after: { company: d.company, pieces: f.pieces, totalMinor: f.totalMinor, advancePct, batches: count }, storeId }, ctx);
    return q.id;
  });
  return { ok: true, id };
}

export async function moveBatch(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, batchId: string, raw: unknown): Promise<{ ok: true } | Fail> {
  const cfg = await deps.resolver.value('bulk.orders', { storeId });
  if (!cfg.enabled) return { ok: false, error: 'SWITCHED_OFF' };
  await requirePermission(deps.db, actor, 'orders.notes', { storeId });
  const p = z.object({ tracking: z.string().trim().max(60).nullable().optional() }).strict().safeParse(raw ?? {});
  if (!p.success) return { ok: false, error: 'INVALID_INPUT' };
  const b = await deps.db.bulkBatch.findFirst({ where: { id: batchId, storeId }, include: { quote: true } });
  if (!b) return { ok: false, error: 'NOT_FOUND' };
  if (!b.quote.advanceReceivedAt) return { ok: false, error: 'ADVANCE_FIRST' };
  const next = BATCH_NEXT[b.status as keyof typeof BATCH_NEXT];
  if (!next) return { ok: false, error: 'LAST_STEP' };
  if (next === 'SHIPPED' && !p.data.tracking) return { ok: false, error: 'TRACKING_NEEDED' };
  await deps.db.bulkBatch.update({ where: { id: b.id }, data: { status: next, ...(next === 'SHIPPED' ? { tracking: p.data.tracking } : {}) } });
  await audit(deps.db, actor, { action: 'bulkBatch.move', entityType: 'BulkBatch', entityId: b.id, before: { status: b.status }, after: { status: next, tracking: next === 'SHIPPED' ? p.data.tracking : b.tracking }, storeId }, ctx);
  return { ok: true };
}

export async function markReceived(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, quoteId: string, raw: unknown): Promise<{ ok: true } | Fail> {
  const cfg = await deps.resolver.value('bulk.orders', { storeId });
  if (!cfg.enabled) return { ok: false, error: 'SWITCHED_OFF' };
  await requirePermission(deps.db, actor, 'orders.notes', { storeId });
  const p = z.object({ which: z.enum(['advance', 'balance']), pin: z.string() }).strict().safeParse(raw);
  if (!p.success) return { ok: false, error: 'INVALID_INPUT' };
  const q = await deps.db.bulkQuote.findFirst({ where: { id: quoteId, storeId }, include: { batches: true } });
  if (!q) return { ok: false, error: 'NOT_FOUND' };
  if (p.data.which === 'advance') {
    if (q.advanceReceivedAt) return { ok: false, error: 'ALREADY_MARKED' };
  } else {
    if (!q.advanceReceivedAt) return { ok: false, error: 'ADVANCE_FIRST' };
    if (q.balanceReceivedAt) return { ok: false, error: 'ALREADY_MARKED' };
    if (!q.batches.length || !q.batches.every((b) => b.status === 'DELIVERED')) return { ok: false, error: 'DELIVER_FIRST' };
  }
  await requireOwnerPin(deps, actor, ctx, p.data.pin, `bulkQuote.${p.data.which}`, storeId);
  const at = deps.now ? deps.now() : new Date();
  await deps.db.bulkQuote.update({ where: { id: q.id }, data: p.data.which === 'advance' ? { advanceReceivedAt: at } : { balanceReceivedAt: at } });
  await audit(deps.db, actor, { action: `bulkQuote.${p.data.which}Received`, entityType: 'BulkQuote', entityId: q.id, before: null, after: { minor: p.data.which === 'advance' ? q.advanceMinor : q.totalMinor - q.advanceMinor }, storeId }, ctx);
  return { ok: true };
}

export async function saveBulkSettings(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, raw: unknown): Promise<{ ok: true } | Fail> {
  await requirePermission(deps.db, actor, 'settings.write', { storeId });
  const p = z.object({ enabled: z.boolean(), defaultAdvancePct: z.number().int().min(0).max(100), quoteValidDays: z.number().int().min(1).max(365), maxBatches: z.number().int().min(1).max(12), batchGapDays: z.number().int().min(1).max(60), firstBatchAfterDays: z.number().int().min(0).max(120), pin: z.string() }).strict().safeParse(raw);
  if (!p.success) return { ok: false, error: 'INVALID_INPUT', details: p.error.issues.map((i) => i.path.join('.')) };
  await requireOwnerPin(deps, actor, ctx, p.data.pin, 'bulk.settings', storeId);
  const before = await deps.resolver.value('bulk.orders', { storeId });
  const { pin: _pin, ...rest } = p.data;
  void _pin;
  const next = { ...before, ...rest };
  await deps.resolver.set('bulk.orders', next, storeTarget(storeId), { actorId: actor.staffUserId ?? null, reason: 'Orders › Bulk' });
  await audit(deps.db, actor, { action: 'bulk.settings.save', entityType: 'Setting', entityId: 'bulk.orders', before, after: next, storeId }, ctx);
  return { ok: true };
}

/* ---------- route ---------- */

const STATUS: Record<string, number> = { SWITCHED_OFF: 409, NOT_FOUND: 404, ENQUIRY_NOT_FOUND: 404, ADVANCE_FIRST: 409, DELIVER_FIRST: 409, ALREADY_MARKED: 409, LAST_STEP: 409, TRACKING_NEEDED: 422, NO_PRICE: 422, NO_PIECES: 422, INVALID_INPUT: 422 }; // hardcode-ok: HTTP statuses of refusal codes, not business numbers

/** GET /api/admin/bulk-orders · POST '' (a quote) · POST settings · POST quotes/:id/received · POST batches/:id/next. */
export async function bulkOrdersRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const url = new URL(request.url);
  const m = request.method.toUpperCase();
  const raw = url.searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : /^\d+$/.test(raw) ? Number(raw) : null;
  if (storeId === null) return fail(400, 'invalid-store-id');
  const [a, id, c] = path;
  const answer = (r: { ok: true } | Fail) => (r.ok ? json({ ok: true }) : fail(STATUS[r.error] ?? 422, r.error, r.details));
  try {
    if (!a && m === 'GET') {
      const g = await guardAdmin(request, deps, { permission: 'orders.read', storeId });
      if (g instanceof Response) return g;
      return json({ ok: true, ...(await bulkView(deps!, storeId)) });
    }
    if (m !== 'POST') return fail(405, 'method-not-allowed');
    const g = await guardAdmin(request, deps, { permission: 'orders.notes', storeId });
    if (g instanceof Response) return g;
    if (!a) {
      const r = await createQuote(deps!, g.actor, g.ctx, storeId, await body(request));
      return r.ok ? json({ ok: true, id: r.id }, { status: 201 }) : fail(STATUS[r.error] ?? 422, r.error, r.details);
    }
    if (a === 'settings' && path.length === 1) return answer(await saveBulkSettings(deps!, g.actor, g.ctx, storeId, await body(request)));
    if (a === 'quotes' && id && isUuid(id) && c === 'received' && path.length === 3) return answer(await markReceived(deps!, g.actor, g.ctx, storeId, id, await body(request)));
    if (a === 'batches' && id && isUuid(id) && c === 'next' && path.length === 3) return answer(await moveBatch(deps!, g.actor, g.ctx, storeId, id, await body(request)));
    return fail(404, 'not-found');
  } catch (e) {
    if (e instanceof Error && (e as { code?: string }).code === 'ENQUIRY_NOT_FOUND') return fail(404, 'ENQUIRY_NOT_FOUND');
    return errorResponse(e);
  }
}
