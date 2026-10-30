// CN-028 · PR 615 — Retail's ERP account: what Retail owes the ERP, kept by the shop as an append-only ledger
// (ErpAccountEntry, docs/RETAIL-ERP-MODEL.md §3.1). One entry per ERP event, never edited, never deleted (a database
// trigger, migration 0049), each one hash-chained to the one before (`seq`, `prevHash` → `hash`), so any change shows.
//
// - Where entries come from: the bill in the answer to `POST /shipments` (BILL, key `ship:<consignment>`, PR 611 calls
//   `recordBill`; the account check also books any billed order it finds without one); every money event of the ERP
//   event ledger (PR 608) — `return.piece.decided` APPROVED / APPROVED_AT_PACKING (RETURN_CREDIT), `exchange.settled`
//   EXTRA / ADJUSTMENT, `exchange.billed`, `exchange.credited`, `payment.recorded` (PAYMENT); the one switch transfer
//   (SWITCH_TRANSFER, PR 619 calls `recordSwitchTransfer`); a shop correction (ADJUSTMENT, PR 616, PIN and reason).
// - A correction from the ERP (`reverses`) is never an edit: a REVERSAL entry undoes the effect of the event it names
//   (same refs, opposite amount, dated on the correction's own date) and the correction's own effect, if it has one, is a
//   new entry keyed `<eventId>:new`. One reversal per entry (unique `reverses`). A correction whose original moved no
//   money only adds its own effect. Money review: when the shop already corrected the original's group by hand (PR
//   616), the ERP's correction undoes that correction instead (`undoDrafts`), so it is never dropped.
// - An event whose amount the books cannot read exactly (more decimals than the currency has) is refused: FAILED with
//   BAD_PAYLOAD, shown on the health panel, never booked as 0.
// - The business date is the ERP's own date of the event (never the day the message arrived); a bill is dated on the
//   store's day of `billedAt`. Amounts are minor units, signed: + Retail owes more, − Retail owes less.
// - Balance = the opening balance at the switch (counted from its day, `ErpStoreLink.openingBalanceMinor`) + every
//   entry. It must equal the ERP's `closingBalance` with zero tolerance (the books match, PR 616).
// - "Paid to ERP" (ErpPaymentRecord): Retail's cash going out, recorded by the Accounts role or the owner
//   (`erp.payments.record`). Recording only writes down a payment already made: nothing is sent to the ERP and no money
//   moves. A wrong record is put right by a reversing record. The records are matched to the ERP's PAYMENT entries
//   (same amount, same reference when both have one, dates at most `books.payments.matchDays` apart).
// Every read and write is on the store's own ERP link (composite foreign key linkId + storeId): store A's ledger can
// never hold or show store B's entries (CN-029 §16).
import { Prisma } from '@extas/db/client';
import { requirePermission, type PermissionKey } from '@extas/auth';
import { brokenLink, chainHash, ENTRY_SIGN, entryKey, entryKindOfEvent, minorOf, signIsRight, type ErpAccountEntryInput, type ErpAccountEntryKind, type ErpEntrySource } from '@extas/erp-types';
import { z } from 'zod';
import { logChange, nowOf, parse, setting, TX, type Db, type InventoryDeps, type Tx, type Who } from './context';
import { BooksError } from './books-errors';
import { isV6 } from './erp-model';
import { currencyDigits } from './erp-push';
import { storeDate } from './erp-events-pull';

// ---- dates ----------------------------------------------------------------------------------------------------------

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const dayText = (d: Date): string => d.toISOString().slice(0, 10);
export const dateOfDay = (d: string): Date => new Date(`${d}T00:00:00Z`);
export const addDay = (d: string, n: number): string => dayText(new Date(dateOfDay(d).getTime() + n * 86_400_000));
export const isDay = (d: unknown): d is string => typeof d === 'string' && DAY.test(d) && dayText(dateOfDay(d)) === d;
export const daySchema = z.string().refine(isDay, { message: 'a day, YYYY-MM-DD' });

// ---- money ----------------------------------------------------------------------------------------------------------

/**
 * An ERP amount in minor units, read exactly (qa-gate): a plain decimal with at most the currency's digits (a trailing
 * zero beyond them is fine). More decimals, grouping, words or an empty text answer null: the books never round an
 * amount and never read a broken one as 0. (The stock sync's `decimalToMinor` still rounds an average cost, PR 196.)
 */
export function moneyMinor(text: string | null | undefined, digits: number): number | null {
  if (text == null) return null;
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(text).trim());
  if (!m) return null;
  const frac = m[3] ?? '';
  if (/[1-9]/.test(frac.slice(digits))) return null;
  const minor = Number(m[2]) * 10 ** digits + Number(frac.slice(0, digits).padEnd(digits, '0') || '0');
  if (!Number.isSafeInteger(minor)) return null;
  return m[1] ? -minor : minor;
}

// ---- the store's link -----------------------------------------------------------------------------------------------

/** The store's ERP link as the books read it (never a secret). */
export interface BooksLink {
  id: string;
  storeId: number;
  epoch: number;
  switchDate: string | null;
  /** What Retail owed the ERP when the shop's books start (PR 619 imports it), counted from `openingBalanceDate`. */
  openingBalanceMinor: number | null;
  openingBalanceDate: string | null;
  createdAt: Date;
}

const LINK_SELECT = { id: true, storeId: true, epoch: true, switchDate: true, openingBalanceMinor: true, openingBalanceDate: true, createdAt: true } as const;

function linkView(r: { id: string; storeId: number; epoch: number; switchDate: Date | null; openingBalanceMinor: bigint | null; openingBalanceDate: Date | null; createdAt: Date }): BooksLink {
  return {
    id: r.id,
    storeId: r.storeId,
    epoch: r.epoch,
    switchDate: r.switchDate ? dayText(r.switchDate) : null,
    openingBalanceMinor: r.openingBalanceMinor == null ? null : minorOf(r.openingBalanceMinor),
    openingBalanceDate: r.openingBalanceDate ? dayText(r.openingBalanceDate) : null,
    createdAt: r.createdAt,
  };
}

/** The store's open ERP link (the newest epoch not ended), or null. Never made here: the first pull opens it. */
export async function storeErpLink(db: Db, storeId: number): Promise<BooksLink | null> {
  const r = await db.erpStoreLink.findFirst({ where: { storeId, endedAt: null }, orderBy: { epoch: 'desc' }, select: LINK_SELECT });
  return r ? linkView(r) : null;
}

/** The store's open link for the books: the store must speak v6 (NOT_V6) and have its link (NO_LINK). */
export async function booksLinkFor(deps: InventoryDeps, storeId: number): Promise<BooksLink> {
  if (!(await isV6(deps, storeId))) throw new BooksError('NOT_V6', 'the books start when the store speaks ERP contract v6');
  const link = await storeErpLink(deps.db, storeId);
  if (!link) throw new BooksError('NO_LINK', 'the store has no ERP link of its own yet');
  return link;
}

/** The store's day, money digits and time zone. */
export async function storeBooks(db: Db, storeId: number): Promise<{ timeZone: string; digits: number }> {
  const s = await db.store.findUniqueOrThrow({ where: { id: storeId }, select: { timezone: true, currency: true } });
  return { timeZone: s.timezone, digits: currencyDigits(s.currency) };
}

/**
 * Locks the store's link row (FOR UPDATE) inside the caller's transaction. The rule of the books (qa-gate): lock the link
 * BEFORE any read that decides a write and before any insert that references it, so two writers of one link queue up
 * instead of deciding from the same snapshot (or deadlocking on the foreign key's share lock).
 */
export async function lockLink(tx: Tx, link: Pick<BooksLink, 'id' | 'storeId'>): Promise<void> {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ErpStoreLink" WHERE "id" = ${link.id}::uuid AND "storeId" = ${link.storeId} FOR UPDATE`;
  if (!locked.length) throw new BooksError('NOT_FOUND', 'no such ERP link on this store');
}

/** The permission in that store, and that the store exists and is not archived (as `allow`, for the books' keys). */
export async function allowBooks(deps: InventoryDeps, who: Who, permission: PermissionKey): Promise<void> {
  if (!Number.isInteger(who.storeId) || who.storeId < 1) throw new BooksError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
  await requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
  const store = await deps.db.store.findUnique({ where: { id: who.storeId }, select: { archivedAt: true } });
  if (!store || store.archivedAt) throw new BooksError('NOT_FOUND', 'no such store', ['storeId']);
}

// ---- appending entries ----------------------------------------------------------------------------------------------

export interface EntryDraft {
  kind: ErpAccountEntryKind;
  eventId: string;
  businessDate: string;
  /** Signed minor units (the sign its kind asks for; a reversal or adjustment carries its own). */
  amountMinor: number;
  externalOrderId?: string | null;
  lineId?: string | null;
  returnListId?: string | null;
  consignmentId?: string | null;
  exchangeId?: string | null;
  paymentRef?: string | null;
  source: ErpEntrySource;
  reverses?: string | null;
  erpEventRowId?: string | null;
  adjustmentId?: string | null;
  createdById?: string | null;
}

export type AccountEntryRow = Prisma.ErpAccountEntryGetPayload<true>;

/** An entry row as the hash covers it. */
export function entryInputOf(r: AccountEntryRow): ErpAccountEntryInput & { prevHash: string | null; hash: string } {
  return {
    seq: r.seq,
    kind: r.kind,
    eventId: r.eventId,
    businessDate: dayText(r.businessDate),
    amountMinor: minorOf(r.amountMinor),
    externalOrderId: r.externalOrderId,
    lineId: r.lineId,
    returnListId: r.returnListId,
    consignmentId: r.consignmentId,
    exchangeId: r.exchangeId,
    paymentRef: r.paymentRef,
    source: r.source,
    reverses: r.reverses,
    prevHash: r.prevHash,
    hash: r.hash,
  };
}

export interface AppendResult {
  created: AccountEntryRow[];
  /** Drafts whose key was already in the ledger (the same event again): nothing written. */
  existing: number;
  /** Reversals of an entry that was already reversed (one reversal per entry): nothing written. */
  alreadyReversed: number;
}

/**
 * Appends entries to a link's ledger, in order, inside the caller's transaction. The link row is locked first, so two
 * writers never take the same `seq`; an eventId already in the ledger is the same event again and writes nothing.
 */
export async function appendAccountEntries(tx: Tx, link: Pick<BooksLink, 'id' | 'storeId'>, drafts: readonly EntryDraft[]): Promise<AppendResult> {
  const out: AppendResult = { created: [], existing: 0, alreadyReversed: 0 };
  if (!drafts.length) return out;
  await lockLink(tx, link);
  const last = await tx.erpAccountEntry.findFirst({ where: { linkId: link.id }, orderBy: { seq: 'desc' }, select: { seq: true, hash: true } });
  let seq = last?.seq ?? 0;
  let prevHash = last?.hash ?? null;
  for (const d of drafts) {
    if (!isDay(d.businessDate)) throw new BooksError('INVALID_INPUT', 'an entry needs a business date', ['businessDate']);
    if (!signIsRight(d.kind, d.amountMinor)) throw new BooksError('INVALID_INPUT', `a ${d.kind} entry cannot carry ${d.amountMinor}`, ['amountMinor']);
    if (!d.eventId || d.eventId.length > 240) throw new BooksError('INVALID_INPUT', 'an entry needs its key', ['eventId']);
    const known = await tx.erpAccountEntry.findUnique({ where: { linkId_eventId: { linkId: link.id, eventId: d.eventId } }, select: { id: true } });
    if (known) {
      out.existing++;
      continue;
    }
    if (d.reverses) {
      const twice = await tx.erpAccountEntry.findUnique({ where: { linkId_reverses: { linkId: link.id, reverses: d.reverses } }, select: { id: true } });
      if (twice) {
        out.alreadyReversed++;
        continue;
      }
    }
    seq++;
    const input: ErpAccountEntryInput = {
      seq,
      kind: d.kind,
      eventId: d.eventId,
      businessDate: d.businessDate,
      amountMinor: d.amountMinor,
      externalOrderId: d.externalOrderId ?? null,
      lineId: d.lineId ?? null,
      returnListId: d.returnListId ?? null,
      consignmentId: d.consignmentId ?? null,
      exchangeId: d.exchangeId ?? null,
      paymentRef: d.paymentRef ?? null,
      source: d.source,
      reverses: d.reverses ?? null,
    };
    const hash = chainHash(prevHash, input);
    const row = await tx.erpAccountEntry.create({
      data: {
        storeId: link.storeId,
        linkId: link.id,
        seq,
        kind: d.kind,
        eventId: d.eventId,
        businessDate: dateOfDay(d.businessDate),
        amountMinor: BigInt(d.amountMinor),
        externalOrderId: input.externalOrderId,
        lineId: input.lineId,
        returnListId: input.returnListId,
        consignmentId: input.consignmentId,
        exchangeId: input.exchangeId,
        paymentRef: input.paymentRef,
        source: d.source,
        reverses: input.reverses,
        erpEventRowId: d.erpEventRowId ?? null,
        adjustmentId: d.adjustmentId ?? null,
        prevHash,
        hash,
        createdById: d.createdById ?? null,
      },
    });
    prevHash = hash;
    out.created.push(row);
  }
  return out;
}

/** Walks a link's chain: 1, 2, 3 … with no gap, every hash right. The first entry that breaks it is named. */
export async function verifyAccountChain(db: Db, linkId: string): Promise<{ ok: true; entries: number } | { ok: false; seq: number; why: 'GAP' | 'PREV_HASH' | 'HASH'; entries: number }> {
  const rows = await db.erpAccountEntry.findMany({ where: { linkId }, orderBy: { seq: 'asc' } });
  const broken = brokenLink(rows.map(entryInputOf));
  return broken ? { ok: false, seq: broken.seq, why: broken.why, entries: rows.length } : { ok: true, entries: rows.length };
}

// ---- balances ---------------------------------------------------------------------------------------------------------

/** The link's opening balance and its day, read fresh (it is imported once, PR 619). */
async function openingOf(db: Db, linkId: string): Promise<{ minor: number; day: string | null }> {
  const l = await db.erpStoreLink.findUnique({ where: { id: linkId }, select: { openingBalanceMinor: true, openingBalanceDate: true } });
  return { minor: l?.openingBalanceMinor == null ? 0 : minorOf(l.openingBalanceMinor), day: l?.openingBalanceDate ? dayText(l.openingBalanceDate) : null };
}

/** What Retail owed at the start and at the end of a business day (the opening balance counts from its own day). */
export async function balanceOn(db: Db, link: Pick<BooksLink, 'id'>, day: string): Promise<{ startMinor: number; endMinor: number }> {
  const d = dateOfDay(day);
  const [r] = await db.$queryRaw<{ before: bigint | null; on: bigint | null }[]>`
    SELECT SUM(CASE WHEN "businessDate" < ${d}::date THEN "amountMinor" ELSE 0 END)::bigint AS "before",
           SUM(CASE WHEN "businessDate" = ${d}::date THEN "amountMinor" ELSE 0 END)::bigint AS "on"
    FROM "ErpAccountEntry" WHERE "linkId" = ${link.id}::uuid AND "businessDate" <= ${d}::date`;
  const o = await openingOf(db, link.id);
  const opening = o.day != null && day >= o.day ? o.minor : 0;
  const before = minorOf(r?.before ?? 0n);
  const on = minorOf(r?.on ?? 0n);
  return { startMinor: opening + before, endMinor: opening + before + on };
}

/** The ledger's whole balance: the opening balance + every entry, whatever its date. */
export async function ledgerBalance(db: Db, link: Pick<BooksLink, 'id'>): Promise<number> {
  const s = await db.erpAccountEntry.aggregate({ where: { linkId: link.id }, _sum: { amountMinor: true } });
  return (await openingOf(db, link.id)).minor + minorOf(s._sum.amountMinor ?? 0n);
}

// ---- the bill -----------------------------------------------------------------------------------------------------------

export interface BillInput {
  storeId: number;
  externalOrderId: string;
  consignmentId: string | null;
  /** The order's `erpTotal`, minor units (fixed when the order was placed). */
  erpTotalMinor: number;
  billedAt: Date;
}

/** The key of an order's bill: by consignment (the shipment call is keyed by it, §10), else by the order. */
export const billKey = (externalOrderId: string, consignmentId: string | null): string => (consignmentId ? entryKey.shipment(consignmentId) : `bill:${externalOrderId}`);

async function billTx(tx: Tx, link: BooksLink, timeZone: string, b: Omit<BillInput, 'storeId'>): Promise<{ created: boolean; entryId: string | null }> {
  if (!Number.isSafeInteger(b.erpTotalMinor) || b.erpTotalMinor <= 0) return { created: false, entryId: null };
  // The link first (qa-gate): two bills of one order at the same moment queue here, and the second finds the first. The
  // database keeps one BILL per order anyway (migration 0055).
  await lockLink(tx, link);
  const prior = await tx.erpAccountEntry.findFirst({ where: { linkId: link.id, kind: 'BILL', externalOrderId: b.externalOrderId }, select: { id: true } });
  if (prior) return { created: false, entryId: prior.id };
  const r = await appendAccountEntries(tx, link, [
    { kind: 'BILL', eventId: billKey(b.externalOrderId, b.consignmentId), businessDate: storeDate(b.billedAt, timeZone), amountMinor: b.erpTotalMinor, externalOrderId: b.externalOrderId, consignmentId: b.consignmentId, source: 'ANSWER' },
  ]);
  return { created: r.created.length > 0, entryId: r.created[0]?.id ?? null };
}

/**
 * The bill of an order whose parcel left (PR 611 calls it with the answer to `POST /shipments`). Once per order: the
 * same order again — by the answer, by the account check, twice at the same moment — writes nothing.
 */
export async function recordBill(deps: InventoryDeps, b: BillInput): Promise<{ created: boolean; entryId: string | null; skipped?: 'ERP_MODEL_V5' | 'NO_LINK' }> {
  if (!(await isV6(deps, b.storeId))) return { created: false, entryId: null, skipped: 'ERP_MODEL_V5' };
  const link = await storeErpLink(deps.db, b.storeId);
  if (!link) return { created: false, entryId: null, skipped: 'NO_LINK' };
  const { timeZone } = await storeBooks(deps.db, b.storeId);
  return deps.db.$transaction((tx) => billTx(tx, link, timeZone, b), TX);
}

/** Every billed order of the link with no bill in the ledger yet (an answer that was missed): booked now. */
export async function syncBills(deps: InventoryDeps, link: BooksLink, timeZone: string): Promise<number> {
  const due = await deps.db.$queryRaw<{ externalOrderId: string; consignmentId: string | null; erpTotalMinor: bigint; billedAt: Date }[]>`
    SELECT o."externalOrderId", o."consignmentId", o."erpTotalMinor", o."billedAt" FROM "ErpOrder" o
    WHERE o."linkId" = ${link.id}::uuid AND o."billedAt" IS NOT NULL AND o."exchangeOfId" IS NULL AND o."erpTotalMinor" > 0
      AND NOT EXISTS (SELECT 1 FROM "ErpAccountEntry" a WHERE a."linkId" = o."linkId" AND a."kind" = 'BILL' AND a."externalOrderId" = o."externalOrderId")
    ORDER BY o."billedAt" ASC, o."externalOrderId" ASC`;
  let n = 0;
  for (const o of due) {
    const r = await deps.db.$transaction((tx) => billTx(tx, link, timeZone, { externalOrderId: o.externalOrderId, consignmentId: o.consignmentId, erpTotalMinor: minorOf(o.erpTotalMinor), billedAt: o.billedAt }), TX);
    if (r.created) n++;
  }
  return n;
}

// ---- entries from the ERP's money events --------------------------------------------------------------------------------

/** The key of an event's own effect: its eventId, or `<eventId>:new` for a correction (its eventId is the reversal's). */
export const effectKey = (ev: { eventId: string; reverses: string | null }): string => (ev.reverses ? `${ev.eventId}:new` : ev.eventId);

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);

/** An ERP event whose amount the books cannot read exactly (PR 615 money review): the event is refused, never booked. */
export class UnreadableAmount extends Error {
  constructor(readonly text: string) {
    super(`the ERP sent an amount the books cannot read exactly: ${JSON.stringify(text.slice(0, 40))}`);
    this.name = 'UnreadableAmount';
  }
}

/**
 * What an event does to the balance on its own (the kind and the signed amount), or null when it moves no money. The
 * amount is read exactly, by the rule of `erpAmount` (erp-orders-v6.ts): one with more decimals than the currency has
 * (or not a plain decimal) throws UnreadableAmount — never read as 0, never rounded, never skipped in silence.
 */
export function eventEffect(ev: { type: string; data: Record<string, unknown> }, digits: number): { kind: ErpAccountEntryKind; amountMinor: number } | null {
  const kind = entryKindOfEvent({ type: ev.type as never, reverses: null, data: ev.data });
  if (!kind) return null;
  const raw = kind === 'RETURN_CREDIT' ? ev.data.credit : ev.data.amount;
  if (raw == null) return null;
  const read = moneyMinor(String(raw), digits);
  if (read == null) throw new UnreadableAmount(String(raw));
  const minor = Math.abs(read);
  if (!minor) return null;
  return { kind, amountMinor: (ENTRY_SIGN[kind] as number) * minor };
}

/** The money events of a link that still owe the ledger an entry (own effect, or the reversal of an original's). */
async function pendingMoneyEvents(db: Db, linkId: string, take: number): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT e."id" FROM "ErpEvent" e
    WHERE e."linkId" = ${linkId}::uuid AND e."moneyEvent" AND e."status" IN ('APPLIED', 'STORED')
      AND (
        (
          (
            (e."type" IN ('payment.recorded', 'exchange.billed', 'exchange.credited') AND COALESCE(NULLIF(e."data"->>'amount', '')::numeric, 0) <> 0)
            OR (e."type" = 'exchange.settled' AND e."data"->>'kind' IN ('EXTRA', 'ADJUSTMENT') AND COALESCE(NULLIF(e."data"->>'amount', '')::numeric, 0) <> 0)
            OR (e."type" = 'return.piece.decided' AND e."data"->>'decision' IN ('APPROVED', 'APPROVED_AT_PACKING') AND COALESCE(NULLIF(e."data"->>'credit', '')::numeric, 0) <> 0)
          )
          AND NOT EXISTS (SELECT 1 FROM "ErpAccountEntry" a WHERE a."linkId" = e."linkId" AND a."eventId" = CASE WHEN e."reverses" IS NULL THEN e."eventId" ELSE e."eventId" || ':new' END)
        )
        OR (
          e."reverses" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "ErpAccountEntry" a WHERE a."linkId" = e."linkId" AND a."eventId" = e."eventId")
          AND EXISTS (
            SELECT 1 FROM "ErpEvent" o JOIN "ErpAccountEntry" a
              ON a."linkId" = o."linkId" AND a."eventId" = CASE WHEN o."reverses" IS NULL THEN o."eventId" ELSE o."eventId" || ':new' END
            WHERE o."linkId" = e."linkId" AND o."eventId" = e."reverses"
              -- not reversed yet, or reversed by a shop correction (PR 616), which this correction then undoes
              AND NOT EXISTS (SELECT 1 FROM "ErpAccountEntry" r WHERE r."linkId" = a."linkId" AND r."reverses" = a."eventId" AND r."adjustmentId" IS NULL)
          )
        )
      )
    ORDER BY e."occurredAt" ASC NULLS LAST, e."receivedAt" ASC, e."id" ASC
    LIMIT ${take}`;
  return rows.map((r) => r.id);
}

/**
 * Writes the entries the link's money events owe the ledger: each event's own effect once (by its key), and for a
 * correction the REVERSAL of the effect of the event it names. Safe to run again and beside a webhook: an entry is
 * written once. Only events the event ledger has processed (APPLIED or STORED) are read; a correction that still waits
 * for its original (WAITING_ORIGINAL) waits here too.
 */
export async function ingestAccountEvents(deps: InventoryDeps, link: BooksLink, ctx: { timeZone: string; digits: number }): Promise<{ events: number; entries: number }> {
  const batch = await setting(deps, null, 'erp.events.applyBatch');
  const out = { events: 0, entries: 0 };
  // A correction's reversal can only follow its original's entry, so a few rounds settle a chain written in one go.
  const rounds = await setting(deps, null, 'erp.events.maxChain');
  for (let round = 0; round <= rounds; round++) {
    const ids = await pendingMoneyEvents(deps.db, link.id, batch);
    if (!ids.length) break;
    let wrote = 0;
    for (const id of ids) {
      const n = await deps.db.$transaction(async (tx) => {
        // The link first (qa-gate): what is undone below is read under the lock every writer of the ledger takes.
        await lockLink(tx, link);
        const ev = await tx.erpEvent.findUniqueOrThrow({ where: { id } });
        if (ev.linkId !== link.id || ev.storeId !== link.storeId) return 0;
        const data = ev.data && typeof ev.data === 'object' ? (ev.data as Record<string, unknown>) : {};
        const businessDate = ev.businessDate ? dayText(ev.businessDate) : storeDate(ev.occurredAt ?? ev.receivedAt, ctx.timeZone);
        // The event's own effect first: an amount the books cannot read refuses the whole event (FAILED, BAD_PAYLOAD,
        // shown on the health panel), so neither its reversal nor a 0 is booked.
        let eff: ReturnType<typeof eventEffect>;
        try {
          eff = eventEffect({ type: ev.type, data }, ctx.digits);
        } catch (e) {
          if (!(e instanceof UnreadableAmount)) throw e;
          await tx.erpEvent.update({ where: { id: ev.id }, data: { status: 'FAILED', error: `BAD_PAYLOAD: ${e.message}`.slice(0, 500) } });
          return 0;
        }
        const drafts: EntryDraft[] = [];
        if (ev.reverses) {
          const orig = await tx.erpEvent.findUnique({ where: { linkId_eventId: { linkId: link.id, eventId: ev.reverses } }, select: { eventId: true, reverses: true } });
          const origEntry = orig ? await tx.erpAccountEntry.findUnique({ where: { linkId_eventId: { linkId: link.id, eventId: effectKey(orig) } } }) : null;
          if (origEntry) {
            const undo = await undoDrafts(tx, link, origEntry, ev);
            if (undo === 'STUCK') {
              await tx.erpEvent.update({ where: { id: ev.id }, data: { status: 'FAILED', error: `CORRECTED_BY_HAND: the shop's own correction already took ${origEntry.eventId} out and holds nothing to undo; put the group right by hand`.slice(0, 500) } });
              return 0;
            }
            drafts.push(...undo.map((u) => ({ ...u, businessDate })));
          }
        }
        if (eff) {
          drafts.push({
            kind: eff.kind,
            eventId: effectKey(ev),
            businessDate,
            amountMinor: eff.amountMinor,
            externalOrderId: ev.externalOrderId,
            lineId: text(data.lineId),
            returnListId: text(data.returnListId),
            consignmentId: text(data.consignmentId),
            exchangeId: text(data.exchangeId),
            paymentRef: text(data.reference),
            source: ev.source,
            erpEventRowId: ev.id,
          });
        }
        return (await appendAccountEntries(tx, link, drafts)).created.length;
      }, TX);
      out.events++;
      out.entries += n;
      wrote += n;
    }
    if (!wrote) break;
  }
  return out;
}

/**
 * What an ERP correction writes to undo its original's entry (PR 615 money review), its business date filled in by the
 * caller. Normally one REVERSAL of that entry. When the shop already put the entry's group right by hand (PR 616: the
 * correction reversed the group's entries and wrote one ADJUSTMENT with the ERP's figure for the group), the
 * original's one reversal is taken, so the ERP's correction undoes the shop's correction instead: a REVERSAL of its
 * ADJUSTMENT, and each other entry that correction had reversed booked again under the event's own key
 * (`<eventId>:keep:<entry>`). Nothing is edited or deleted; the group then holds the shop's own figures for what the ERP
 * did not cancel, and any part the ERP figures otherwise shows again as a difference of that group (put right by hand).
 * Empty when the ERP reversed the entry already (the same correction twice); STUCK when the shop's correction left
 * nothing to undo (it wrote no ADJUSTMENT): the event is then refused for a person.
 */
async function undoDrafts(tx: Tx, link: Pick<BooksLink, 'id'>, entry: AccountEntryRow, ev: { id: string; eventId: string; source: ErpEntrySource }, depth = 0): Promise<Omit<EntryDraft, 'businessDate'>[] | 'STUCK'> {
  const refs = (e: AccountEntryRow) => ({ externalOrderId: e.externalOrderId, lineId: e.lineId, returnListId: e.returnListId, consignmentId: e.consignmentId, exchangeId: e.exchangeId, paymentRef: e.paymentRef });
  const reversal = await tx.erpAccountEntry.findUnique({ where: { linkId_reverses: { linkId: link.id, reverses: entry.eventId } } });
  if (!reversal) return [{ kind: 'REVERSAL', eventId: ev.eventId, amountMinor: -minorOf(entry.amountMinor), ...refs(entry), source: ev.source, reverses: entry.eventId, erpEventRowId: ev.id }];
  if (!reversal.adjustmentId || depth > 8) return [];
  const adjKey = entryKey.adjustment(reversal.adjustmentId);
  const adjEntry = await tx.erpAccountEntry.findUnique({ where: { linkId_eventId: { linkId: link.id, eventId: adjKey } } });
  if (!adjEntry) return 'STUCK';
  const adjUndone = await tx.erpAccountEntry.findUnique({ where: { linkId_reverses: { linkId: link.id, reverses: adjKey } }, select: { id: true } });
  if (adjUndone) {
    // An earlier ERP correction of the same group undid the shop's correction and booked this entry again: undo that.
    const kept = await tx.erpAccountEntry.findFirst({ where: { linkId: link.id, eventId: { endsWith: `:keep:${entry.eventId}` } }, orderBy: { seq: 'desc' } });
    return kept ? undoDrafts(tx, link, kept, ev, depth + 1) : 'STUCK';
  }
  const others = await tx.erpAccountEntry.findMany({ where: { linkId: link.id, adjustmentId: reversal.adjustmentId, kind: 'REVERSAL', NOT: { reverses: entry.eventId } }, orderBy: { seq: 'asc' }, select: { reverses: true } });
  const originals = others.length ? await tx.erpAccountEntry.findMany({ where: { linkId: link.id, eventId: { in: others.map((o) => o.reverses!) } }, orderBy: { seq: 'asc' } }) : [];
  return [
    { kind: 'REVERSAL', eventId: ev.eventId, amountMinor: -minorOf(adjEntry.amountMinor), ...refs(entry), source: ev.source, reverses: adjEntry.eventId, erpEventRowId: ev.id },
    ...originals.map((o) => ({ kind: o.kind, eventId: `${ev.eventId}:keep:${o.eventId}`, amountMinor: minorOf(o.amountMinor), ...refs(o), source: ev.source, erpEventRowId: ev.id })),
  ];
}

// ---- the switch -----------------------------------------------------------------------------------------------------------

/**
 * The one-time transfer of old open amounts at the switch date, at the buying price (owner's answer "ক", §9; PR 619
 * calls it with the ERP's list): + Retail owes more (the unpaid amounts moved), − less (customer advances credited).
 * Once per switch date: the same call again writes nothing.
 */
export async function recordSwitchTransfer(deps: InventoryDeps, input: { storeId: number; switchDate: string; amountMinor: number; reference: string | null }): Promise<{ created: boolean }> {
  if (!isDay(input.switchDate)) throw new BooksError('INVALID_INPUT', 'the switch date is a day', ['switchDate']);
  // PR 619: the ERP's one transfer nets the customer advances it credits against the unpaid amounts it moves, so it may
  // go either way; it is never 0 (nothing to book).
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor === 0) throw new BooksError('INVALID_INPUT', 'the transfer is a whole amount other than 0', ['amountMinor']);
  const link = await storeErpLink(deps.db, input.storeId);
  if (!link) throw new BooksError('NO_LINK', 'the store has no ERP link of its own yet');
  const r = await deps.db.$transaction(
    (tx) => appendAccountEntries(tx, link, [{ kind: 'SWITCH_TRANSFER', eventId: entryKey.switchTransfer(input.switchDate), businessDate: input.switchDate, amountMinor: input.amountMinor, paymentRef: text(input.reference), source: 'SWITCH' }]),
    TX,
  );
  return { created: r.created.length > 0 };
}

/**
 * What Retail owed the ERP when the shop's books start (PR 619 imports it from the ERP's list of moved orders, at the
 * buying price). Written once for the link (ALREADY after that): a handover starts a new link with its own.
 */
export async function importOpeningBalance(deps: InventoryDeps, input: { storeId: number; amountMinor: number; date: string }): Promise<{ created: true }> {
  if (!isDay(input.date)) throw new BooksError('INVALID_INPUT', 'the opening balance counts from a day', ['date']);
  if (!Number.isSafeInteger(input.amountMinor)) throw new BooksError('INVALID_INPUT', 'the opening balance is a whole amount', ['amountMinor']);
  const link = await storeErpLink(deps.db, input.storeId);
  if (!link) throw new BooksError('NO_LINK', 'the store has no ERP link of its own yet');
  const now = nowOf(deps);
  await deps.db.$transaction(async (tx) => {
    const done = await tx.erpStoreLink.updateMany({
      where: { id: link.id, storeId: input.storeId, openingImportedAt: null },
      data: { openingBalanceMinor: BigInt(input.amountMinor), openingBalanceDate: dateOfDay(input.date), openingImportedAt: now },
    });
    if (!done.count) throw new BooksError('ALREADY', 'the opening balance of this ERP link is already in');
    await logChange(tx, { actor: { staffUserId: null }, storeId: input.storeId, ctx: { source: 'books' } }, {
      action: 'books.opening.import',
      entityType: 'ErpStoreLink',
      entityId: link.id,
      before: null,
      after: { amountMinor: input.amountMinor, date: input.date },
      storeId: input.storeId,
    });
  }, TX);
  return { created: true };
}

// ---- "paid to ERP" ----------------------------------------------------------------------------------------------------------

export const erpPaymentInput = z
  .object({
    paidOn: daySchema,
    amountMinor: z.int().positive().max(Number.MAX_SAFE_INTEGER),
    method: z.string().trim().max(40).nullish(),
    reference: z.string().trim().max(200).nullish(),
    note: z.string().trim().max(500).nullish(),
  })
  .strict();
export type ErpPaymentInput = z.input<typeof erpPaymentInput>;

export type PaymentRecordRow = Prisma.ErpPaymentRecordGetPayload<true>;

const REQUEST_KEY = /^[A-Za-z0-9._:-]{8,120}$/;

/**
 * Records a payment Retail made to the ERP (Accounts or the owner). It only writes it down: nothing is sent, no money
 * moves. With a request key (the form sends one per opening, as `Idempotency-Key`; follow-up 551) the same request again
 * — a double tap, a retry after a lost answer, two at once — answers the record already written; the same key with other
 * figures is refused (CONFLICT). The database keeps one record per key and link.
 */
export async function recordErpPayment(deps: InventoryDeps, who: Who, input: ErpPaymentInput, opts: { requestKey?: string | null } = {}): Promise<PaymentRecordRow> {
  await allowBooks(deps, who, 'erp.payments.record');
  const d = parse(erpPaymentInput, input, 'payment to the ERP');
  if (!who.actor.staffUserId) throw new BooksError('INVALID_INPUT', 'a payment is recorded by a person', ['actor']);
  const requestKey = opts.requestKey ? String(opts.requestKey).trim() : null;
  if (requestKey !== null && !REQUEST_KEY.test(requestKey)) throw new BooksError('INVALID_INPUT', 'the request key is not one the form sends', ['requestKey']);
  const link = await booksLinkFor(deps, who.storeId);
  const fields = { paidOn: dateOfDay(d.paidOn), amountMinor: BigInt(d.amountMinor), method: d.method || null, reference: d.reference || null, note: d.note || null };
  const same = (r: PaymentRecordRow) => r.paidOn.getTime() === fields.paidOn.getTime() && r.amountMinor === fields.amountMinor && r.method === fields.method && r.reference === fields.reference && r.note === fields.note && !r.reversesId;
  const replay = async (): Promise<PaymentRecordRow | null> => {
    if (!requestKey) return null;
    const prior = await deps.db.erpPaymentRecord.findUnique({ where: { linkId_requestKey: { linkId: link.id, requestKey } } });
    if (prior && !same(prior)) throw new BooksError('CONFLICT', 'this request key was used for another payment', ['requestKey']);
    return prior;
  };
  const prior = await replay();
  if (prior) return prior;
  try {
    return await deps.db.$transaction(async (tx) => {
      const row = await tx.erpPaymentRecord.create({ data: { storeId: who.storeId, linkId: link.id, ...fields, requestKey, recordedById: who.actor.staffUserId! } });
      await logChange(tx, who, { action: 'books.payment.record', entityType: 'ErpPaymentRecord', entityId: row.id, before: null, after: { paidOn: d.paidOn, amountMinor: d.amountMinor, method: row.method, reference: row.reference }, storeId: who.storeId });
      return row;
    }, TX);
  } catch (e) {
    // The same key written a moment ago by the twin request: answer that record.
    if (isP2002(e) && requestKey) {
      const twin = await replay();
      if (twin) return twin;
    }
    throw e;
  }
}

export const erpPaymentReverseInput = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

/** Puts a wrong record right: a new record with the opposite amount that names it. Once per record; never an edit. */
export async function reverseErpPayment(deps: InventoryDeps, who: Who, recordId: string, input: z.input<typeof erpPaymentReverseInput>): Promise<PaymentRecordRow> {
  await allowBooks(deps, who, 'erp.payments.record');
  const d = parse(erpPaymentReverseInput, input, 'reversal');
  if (!who.actor.staffUserId) throw new BooksError('INVALID_INPUT', 'a payment is reversed by a person', ['actor']);
  const link = await booksLinkFor(deps, who.storeId);
  const rec = await deps.db.erpPaymentRecord.findFirst({ where: { id: recordId, storeId: who.storeId, linkId: link.id } });
  if (!rec) throw new BooksError('NOT_FOUND', 'no such payment record', ['recordId']);
  if (rec.reversesId) throw new BooksError('CONFLICT', 'a reversing record is not reversed again; record the payment anew', ['recordId']);
  try {
    return await deps.db.$transaction(async (tx) => {
      const prior = await tx.erpPaymentRecord.findUnique({ where: { reversesId: rec.id }, select: { id: true } });
      if (prior) throw new BooksError('ALREADY', 'this record is already reversed', ['recordId']);
      const row = await tx.erpPaymentRecord.create({
        data: { storeId: who.storeId, linkId: link.id, paidOn: rec.paidOn, amountMinor: -rec.amountMinor, method: rec.method, reference: rec.reference, note: d.reason, reversesId: rec.id, recordedById: who.actor.staffUserId! },
      });
      await logChange(tx, who, { action: 'books.payment.reverse', entityType: 'ErpPaymentRecord', entityId: row.id, before: { recordId: rec.id, amountMinor: minorOf(rec.amountMinor) }, after: { reason: d.reason }, storeId: who.storeId });
      return row;
    }, TX);
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw new BooksError('ALREADY', 'this record is already reversed', ['recordId']);
    throw e;
  }
}

export interface PaymentMatch {
  matched: { recordId: string; entryEventId: string; paidOn: string; erpDate: string; amountMinor: number; reference: string | null }[];
  /** Recorded by the shop, not (yet) by the ERP. */
  shopOnly: { recordId: string; paidOn: string; amountMinor: number; reference: string | null }[];
  /** Recorded by the ERP (`payment.recorded`), not by the shop. */
  erpOnly: { entryEventId: string; date: string; amountMinor: number; reference: string | null }[];
}

const dayGap = (a: string, b: string) => Math.abs(Math.round((dateOfDay(a).getTime() - dateOfDay(b).getTime()) / 86_400_000));

/**
 * Pairs each "paid to ERP" record (not reversed) with one ERP payment (a PAYMENT entry the ERP has not reversed; one
 * the shop corrected by hand counts at its correction's figure): the same amount, the same reference when both have
 * one, dates at most `books.payments.matchDays` apart. Earliest first.
 */
export async function paymentMatch(deps: InventoryDeps, link: Pick<BooksLink, 'id' | 'storeId'>): Promise<PaymentMatch> {
  const days = await setting(deps, link.storeId, 'books.payments.matchDays');
  const recs = await deps.db.erpPaymentRecord.findMany({ where: { linkId: link.id }, orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }] });
  const reversed = new Set(recs.filter((r) => r.reversesId).map((r) => r.reversesId!));
  const shop = recs.filter((r) => !r.reversesId && !reversed.has(r.id)).map((r) => ({ recordId: r.id, paidOn: dayText(r.paidOn), amountMinor: minorOf(r.amountMinor), reference: r.reference }));
  const pays = await deps.db.erpAccountEntry.findMany({ where: { linkId: link.id, kind: 'PAYMENT' }, orderBy: [{ businessDate: 'asc' }, { seq: 'asc' }] });
  const reversals = await deps.db.erpAccountEntry.findMany({ where: { linkId: link.id, reverses: { in: pays.map((p) => p.eventId) } }, select: { reverses: true, adjustmentId: true } });
  // Undone by the ERP (its own correction): no payment any more. Taken out by a shop correction (PR 616, money
  // review): the ERP's payment still stands, at the figure the correction wrote for its group (its ADJUSTMENT), so the
  // "paid to ERP" record of a payment that really happened is never unmatched for the group having been corrected.
  const undone = new Set(reversals.filter((r) => !r.adjustmentId).map((r) => r.reverses!));
  const correctedBy = new Map(reversals.filter((r) => r.adjustmentId).map((r) => [r.reverses!, r.adjustmentId!]));
  const adjKeys = [...new Set(correctedBy.values())].map((a) => entryKey.adjustment(a));
  const adjEntries = adjKeys.length ? await deps.db.erpAccountEntry.findMany({ where: { linkId: link.id, eventId: { in: adjKeys } } }) : [];
  const adjUndone = new Set(adjEntries.length ? (await deps.db.erpAccountEntry.findMany({ where: { linkId: link.id, reverses: { in: adjEntries.map((a) => a.eventId) } }, select: { reverses: true } })).map((r) => r.reverses!) : []);
  const standing = new Map(adjEntries.filter((a) => !adjUndone.has(a.eventId)).map((a) => [a.adjustmentId!, a]));
  const taken = new Set<string>();
  const erp: { entryEventId: string; date: string; amountMinor: number; reference: string | null }[] = [];
  for (const p of pays) {
    if (undone.has(p.eventId)) continue;
    const adjId = correctedBy.get(p.eventId);
    if (!adjId) {
      erp.push({ entryEventId: p.eventId, date: dayText(p.businessDate), amountMinor: -minorOf(p.amountMinor), reference: p.paymentRef });
      continue;
    }
    // One payment per correction (the ERP's figure for the group), named by the first payment it took out.
    const a = standing.get(adjId);
    if (!a || taken.has(adjId) || minorOf(a.amountMinor) >= 0) continue;
    taken.add(adjId);
    erp.push({ entryEventId: p.eventId, date: dayText(p.businessDate), amountMinor: -minorOf(a.amountMinor), reference: p.paymentRef });
  }
  const used = new Set<string>();
  const out: PaymentMatch = { matched: [], shopOnly: [], erpOnly: [] };
  for (const s of shop) {
    const hit = erp.find((e) => !used.has(e.entryEventId) && e.amountMinor === s.amountMinor && dayGap(e.date, s.paidOn) <= days && (!s.reference || !e.reference || s.reference === e.reference));
    if (hit) {
      used.add(hit.entryEventId);
      out.matched.push({ recordId: s.recordId, entryEventId: hit.entryEventId, paidOn: s.paidOn, erpDate: hit.date, amountMinor: s.amountMinor, reference: s.reference ?? hit.reference });
    } else out.shopOnly.push(s);
  }
  for (const e of erp) if (!used.has(e.entryEventId)) out.erpOnly.push(e);
  return out;
}

export const isP2002 = (e: unknown): boolean => (e as { code?: string })?.code === 'P2002';
export { Prisma };
