// S16 · PR 344 (B3.8; BACKEND-ARCHITECTURE §5 MNY-04) — Money → Expenses (`/admin/money/expenses`): the owner's quick
// entry of a retail expense on a head he names himself (office, salary share, misc …), wherever he is.
//
// One path to the ERP, never two (B3.8: "typing them twice is how numbers stop matching"; CN-028: the month-end push
// became the daily summary and the monthly fixed costs). An expense is entered through PR 618's cost line
// (`addCostEntry`: the open-day check, the caps, the books lock, the request key, the day's summary built again), on its
// head's summary line (OTHER when the head names none); the RetailExpense row keeps the owner's own view — the head,
// the day, the note, who — and points at the cost entry that carries it to the ERP (`erpPushId`). A wrong expense is
// never edited or deleted: it is reversed (PR 618's `reverseCostEntry`, never twice) and the reversal is a negative
// RetailExpense pointing at the reversing cost entry. Salaries and rent are the month's fixed costs on Money → Costs.
//
// `path` is what comes after /api/admin/money/expenses (`?storeId=`, default the mother store):
//   GET   ''                     ?month=YYYY-MM   the heads and the month's expenses (`books.read`)
//   POST  ''                     {headId, day, amountMinor, note?, requestKey}   one expense (`fixedcosts.write`)
//   POST  ':id/reverse'          {reason}   reverse an expense (`fixedcosts.write`)
//   POST  'heads'                {nameEn, nameBn?, line}   a new head (`fixedcosts.write`; audited)
//   POST  'heads/:id/archive'    {archived}   put a head away or bring it back (nothing is deleted; audited)
//   POST  'receipts'             multipart `file` — a receipt's photo or PDF while `costs.receipts` is on, checked by its
//                                contents, kept in the media library (folder "expense-receipts"); answers its id; the
//                                expense then names it as `receiptId` (`fixedcosts.write`; PR 344 follow-up, 0070)
//   GET   'receipts/:id'         the receipt file, our stored copy (`books.read`)
// Nothing here moves money: these are the shop's own cost records for the ERP's reports.
import { z } from 'zod';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import * as inv from '@extas/inventory';
import { storeGeneratedFile, type MediaDeps } from '@extas/media';
import { ymdIn } from '@extas/metrics';
import { cleanFileName, sniffFile } from '@extas/support';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps, type Guarded } from './admin-auth';
import { inventoryDeps } from './inventory-api';
import { mediaDeps } from './media';

/** The media library folder a receipt is kept in (PR 344 follow-up). */
export const RECEIPT_FOLDER = 'expense-receipts';

type Db = Pick<PrismaClient, 'expenseHead' | 'retailExpense' | 'costEntry'>;
type CostSummaryLine = (typeof inv.COST_LINE_ORDER)[number];

/** The line an expense counts on when its head names none. */
export const DEFAULT_EXPENSE_LINE: CostSummaryLine = 'OTHER';

export interface ExpenseHeadRow {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  line: CostSummaryLine;
  archived: boolean;
}
export interface ExpenseRow {
  id: string;
  headId: string;
  day: string;
  amountMinor: number;
  note: string | null;
  /** A reversal of another expense (negative). */
  reversal: boolean;
  /** This expense was reversed already. */
  reversed: boolean;
  /** The receipt's photo or PDF (MediaAsset id), when one was added. */
  receiptId: string | null;
  at: string;
}
export interface ExpensesView {
  month: string;
  heads: ExpenseHeadRow[];
  rows: ExpenseRow[];
  byHead: { headId: string; minor: number; count: number }[];
  totalMinor: number;
}

const dayText = (d: Date) => d.toISOString().slice(0, 10);
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** A head's key from its English name: lower-case words joined by "-" (letters and digits only). */
export function headKey(name: string): string {
  return (
    name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'head'
  );
}

/** The heads of a store and the expenses of one month (newest first), with the totals by head. */
export async function expensesView(db: Db, storeId: number, month: string): Promise<ExpensesView> {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  const [heads, rows] = await Promise.all([
    db.expenseHead.findMany({ where: { storeId }, orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { nameEn: 'asc' }], select: { id: true, key: true, nameEn: true, nameBn: true, summaryLine: true, archivedAt: true } }),
    db.retailExpense.findMany({ where: { storeId, date: { gte: from, lt: to } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], select: { id: true, headId: true, date: true, amountMinor: true, note: true, erpPushId: true, receiptMediaId: true, createdAt: true } }),
  ]);
  const costIds = rows.map((r) => r.erpPushId).filter((v): v is string => Boolean(v));
  const [reversals, reversed] = costIds.length
    ? await Promise.all([
        db.costEntry.findMany({ where: { storeId, id: { in: costIds }, refType: 'CostEntry' }, select: { id: true } }),
        db.costEntry.findMany({ where: { storeId, refType: 'CostEntry', refId: { in: costIds } }, select: { refId: true } }),
      ])
    : [[], []];
  const isReversal = new Set(reversals.map((r) => r.id));
  const wasReversed = new Set(reversed.map((r) => r.refId));
  const out = rows.map((r) => ({
    id: r.id,
    headId: r.headId,
    day: dayText(r.date),
    amountMinor: r.amountMinor,
    note: r.note,
    reversal: r.erpPushId ? isReversal.has(r.erpPushId) : r.amountMinor < 0,
    reversed: r.erpPushId ? wasReversed.has(r.erpPushId) : false,
    receiptId: r.receiptMediaId,
    at: r.createdAt.toISOString(),
  }));
  const byHead = new Map<string, { minor: number; count: number }>();
  for (const r of out) {
    const h = byHead.get(r.headId) ?? { minor: 0, count: 0 };
    byHead.set(r.headId, { minor: h.minor + r.amountMinor, count: h.count + (r.reversal ? 0 : 1) });
  }
  return {
    month,
    heads: heads.map((h) => ({ id: h.id, key: h.key, nameEn: h.nameEn, nameBn: h.nameBn, line: h.summaryLine ?? DEFAULT_EXPENSE_LINE, archived: h.archivedAt !== null })),
    rows: out,
    byHead: [...byHead].map(([headId, v]) => ({ headId, ...v })).sort((a, b) => b.minor - a.minor),
    totalMinor: out.reduce((s, r) => s + r.amountMinor, 0),
  };
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

const invalid = (details: string[]) => json({ ok: false, error: 'INVALID_INPUT', details }, { status: 400 });
const whoOf = (g: Guarded, storeId: number): inv.Who => ({ actor: g.actor, storeId, ctx: g.ctx });

const headInput = z.object({ nameEn: z.string().trim().min(1).max(80), nameBn: z.string().trim().max(80).nullish(), line: z.enum(inv.COST_LINE_ORDER as readonly [CostSummaryLine, ...CostSummaryLine[]]) });
const addInput = z.object({ headId: z.uuid(), day: z.iso.date(), amountMinor: z.int(), note: z.string().trim().max(300).nullish(), receiptId: z.uuid().nullish(), requestKey: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/) });

/** A receipt: a picture or a PDF only, by its contents, within `costs.receipts`; kept as the shop's own copy. */
async function uploadReceipt(request: Request, d: AdminDeps, media: MediaDeps | null, storeId: number, staffUserId: string | null): Promise<Response> {
  const rules = await d.resolver.value('costs.receipts', { storeId });
  if (!rules.enabled) return fail(422, 'RECEIPTS_OFF');
  const maxBytes = rules.maxMb * 1024 * 1024;
  // the form around the file adds a little; anything far beyond the limit is refused before it is read
  if (Number(request.headers.get('content-length') ?? '0') > maxBytes * 1.05 + 64 * 1024) return fail(413, 'TOO_LARGE', [`max:${rules.maxMb}`]);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'INVALID_INPUT', ['file']);
  }
  const file = form.get('file');
  if (!(file instanceof File)) return fail(400, 'INVALID_INPUT', ['file']);
  if (file.size === 0) return fail(400, 'EMPTY', ['file']);
  if (file.size > maxBytes) return fail(413, 'TOO_LARGE', [`max:${rules.maxMb}`]);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffFile(bytes);
  if (!kind || (kind.kind !== 'image' && kind.kind !== 'pdf')) return fail(422, 'FILE_NOT_ALLOWED', ['file']);
  if (!media) return fail(503, 'database-not-configured');
  const fileName = cleanFileName(file.name);
  const a = await storeGeneratedFile(media, { storeId, kind: kind.mediaKind, body: bytes, contentType: kind.contentType, name: 'expense receipt', extension: kind.extension, folder: RECEIPT_FOLDER, fileName, uploadedById: staffUserId });
  return json({ ok: true, file: { id: a.id, fileName, contentType: kind.contentType } }, { status: 201 });
}

const receiptOf = (db: Pick<PrismaClient, 'mediaAsset'>, storeId: number, id: string) =>
  db.mediaAsset.findFirst({ where: { id, storeId, folder: RECEIPT_FOLDER }, select: { id: true, storage: true, storageKey: true, mimeType: true, originalFileName: true } });

async function downloadReceipt(d: AdminDeps, media: MediaDeps | null, storeId: number, id: string): Promise<Response> {
  const f = await receiptOf(d.db, storeId, id);
  if (!f) return fail(404, 'NOT_FOUND', ['id']);
  if (!media) return fail(503, 'database-not-configured');
  const got = await (await media.storage(storeId, f.storage as Parameters<typeof media.storage>[1])).get(f.storageKey);
  if (!got) return fail(404, 'NOT_FOUND', ['id']);
  const name = (f.originalFileName ?? 'receipt').replace(/[^\x20-\x7e]/g, '_').replace(/[\\"]/g, '_');
  return new Response(new Uint8Array(got.body), {
    status: 200,
    headers: { 'content-type': f.mimeType, 'content-disposition': `inline; filename="${name}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex' },
  });
}

/** The expenses admin routes (the table above); `media` (tests) replaces the app's file storage. */
export async function expensesRoute(request: Request, deps: AdminDeps | null, path: string[], media?: MediaDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const [a, b2, c3] = path;
  const kind =
    path.length === 0
      ? m === 'GET'
        ? 'view'
        : m === 'POST'
          ? 'add'
          : null
      : a === 'receipts' && path.length === 1
        ? 'upload'
        : a === 'receipts' && path.length === 2 && isUuid(b2 ?? '')
          ? 'receipt'
          : a === 'heads' && path.length === 1
            ? 'head'
            : a === 'heads' && c3 === 'archive' && path.length === 3
              ? 'archive'
              : b2 === 'reverse' && path.length === 2
                ? 'reverse'
                : undefined;
  if (kind === undefined) return fail(404, 'not-found');
  const reading = kind === 'view' || kind === 'receipt';
  if (kind === null || (reading ? m !== 'GET' : m !== 'POST')) return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: reading ? 'books.read' : 'fixedcosts.write', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    if (kind === 'upload' || kind === 'receipt') {
      const files = media === undefined ? mediaDeps() : media;
      return kind === 'upload' ? await uploadReceipt(request, d, files, storeId, g.actor.staffUserId ?? null) : await downloadReceipt(d, files, storeId, b2!);
    }
    if (kind === 'view') {
      const month = url.searchParams.get('month') ?? ymdIn(new Date(), await d.resolver.value('store.timeZone', { storeId })).slice(0, 7);
      if (!monthSchema.safeParse(month).success) return invalid(['month: YYYY-MM']);
      return json({ ok: true, ...(await expensesView(d.db, storeId, month)) });
    }
    const b = await body(request);
    if (kind === 'head') {
      const x = headInput.safeParse(b);
      if (!x.success) return invalid(x.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
      const key = headKey(x.data.nameEn);
      if (await d.db.expenseHead.findUnique({ where: { storeId_key: { storeId, key } }, select: { id: true } })) return json({ ok: false, error: 'CONFLICT', details: ['nameEn: a head with this name is already there'] }, { status: 409 });
      const head = await d.db.expenseHead.create({ data: { storeId, key, nameEn: x.data.nameEn, nameBn: x.data.nameBn || null, summaryLine: x.data.line }, select: { id: true, key: true } });
      await audit(d.db, g.actor, { storeId, action: 'expenses.head.add', entityType: 'ExpenseHead', entityId: head.id, before: null, after: { key, nameEn: x.data.nameEn, nameBn: x.data.nameBn || null, line: x.data.line } }, g.ctx);
      return json({ ok: true, head }, { status: 201 });
    }
    if (kind === 'archive') {
      if (!isUuid(b2 ?? '') || typeof b.archived !== 'boolean') return invalid(['archived: true or false']);
      const head = await d.db.expenseHead.findFirst({ where: { id: b2, storeId }, select: { id: true, archivedAt: true } });
      if (!head) return fail(404, 'NOT_FOUND');
      if ((head.archivedAt !== null) !== b.archived) {
        await d.db.expenseHead.update({ where: { id: head.id }, data: { archivedAt: b.archived ? new Date() : null } });
        await audit(d.db, g.actor, { storeId, action: 'expenses.head.archive', entityType: 'ExpenseHead', entityId: head.id, before: { archived: head.archivedAt !== null }, after: { archived: b.archived } }, g.ctx);
      }
      return json({ ok: true, archived: b.archived });
    }
    const idep = await inventoryDeps(d);
    if (kind === 'reverse') {
      if (!isUuid(a ?? '')) return fail(404, 'NOT_FOUND');
      const e = await d.db.retailExpense.findFirst({ where: { id: a, storeId }, select: { id: true, headId: true, erpPushId: true, amountMinor: true } });
      if (!e || !e.erpPushId) return fail(404, 'NOT_FOUND');
      const r = await inv.reverseCostEntry(idep, whoOf(g, storeId), e.erpPushId, { reason: b.reason });
      const reversal = await d.db.costEntry.findUniqueOrThrow({ where: { id: r.id }, select: { costDate: true, detail: true } });
      const row = await d.db.retailExpense.create({
        data: { storeId, headId: e.headId, amountMinor: -e.amountMinor, date: reversal.costDate ?? new Date(), note: reversal.detail, enteredById: g.actor.staffUserId ?? null, erpPushId: r.id },
        select: { id: true },
      });
      return json({ ok: true, id: row.id, resummarised: r.resummarised }, { status: 201 });
    }
    const x = addInput.safeParse(b);
    if (!x.success) return invalid(x.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    const head = await d.db.expenseHead.findFirst({ where: { id: x.data.headId, storeId, archivedAt: null }, select: { id: true, nameEn: true, summaryLine: true } });
    if (!head) return invalid(['headId: an expense head of this store that is not put away']);
    const note = x.data.note || null;
    const receiptId = x.data.receiptId ?? null;
    if (receiptId && !(await receiptOf(d.db, storeId, receiptId))) return invalid(['receiptId: a receipt added on this page']);
    // PR 618's cost line does every check (open day, caps, the link) and keeps the request key
    const cost = await inv.addCostEntry(idep, whoOf(g, storeId), { line: head.summaryLine ?? DEFAULT_EXPENSE_LINE, day: x.data.day, amountMinor: x.data.amountMinor, note: note ? `${head.nameEn}: ${note}` : head.nameEn, requestKey: x.data.requestKey });
    const row = await d.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RetailExpense:${cost.id}`}))`;
      const seen = await tx.retailExpense.findFirst({ where: { storeId, erpPushId: cost.id }, select: { id: true } });
      if (seen) return { id: seen.id, repeated: true };
      const made = await tx.retailExpense.create({ data: { storeId, headId: head.id, amountMinor: x.data.amountMinor, date: new Date(`${x.data.day}T00:00:00Z`), note, enteredById: g.actor.staffUserId ?? null, erpPushId: cost.id, receiptMediaId: receiptId }, select: { id: true } });
      return { id: made.id, repeated: false };
    });
    return json({ ok: true, ...row, costEntryId: cost.id, resummarised: cost.resummarised }, { status: row.repeated ? 200 : 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
