// CN-029 Phase 3 qa-gate I1 (PR 621) — the CI-only sample store on ERP contract v6 (data/sample-erp-v6.json). The device
// gate and the smoke ran only on the sample catalogue store, which speaks v5, so the v6 books, the account-hold notice
// and the ERP forms opened in place were never measured (F1 was found by hand). This adds ONE more sample store that
// speaks v6 through its own practice-ERP connection (MOCK, no key), with sample books from `switchDaysAgo` days ago
// (opening balance, a bill, a payment, a return credit), day closes through yesterday hash-chained as the engine writes
// them, the two differences of one day (an order's bill a paisa above the ERP's — adjustable — and the broken tie), a
// week and the lifetime check, and the ERP's account hold.
// SAMPLE DATA ONLY (CLAUDE.md rule 4, PR 509): it runs only on the explicit `sample:v6` command, only where the sample
// catalogue seed ran (its DefaultPackApplication mark), and never changes the sample catalogue store; staging and an
// owner installation never run it. Idempotent: once the store's slug is there it writes nothing. Dates count back from
// the clock, so the books always end yesterday.
import { createHash } from 'node:crypto';
import { SYSTEM } from '@extas/auth';
import { SAMPLE_PACK_KEY } from '@extas/seed';
import type { BooksCheck, BooksDifferenceClass, BooksResult } from '@extas/erp-types';
import { z } from 'zod';
import sampleJson from '../data/sample-erp-v6.json';
import { nowOf, type InventoryDeps } from './context';
import { addDay, appendAccountEntries, balanceOn, importOpeningBalance, ledgerBalance, storeErpLink, type EntryDraft } from './erp-account';
import { storeDate } from './erp-events-pull';
import { openErpLink } from './erp-link';
import { setErpMode } from './erp-mode';
import { noteHold } from './erp-orders-v6';
import { closeCanonical, writePeriodClose } from './books-match';

const id = z.string().min(1).max(120);
const sampleSchema = z
  .object({
    $comment: z.string(),
    version: z.int().min(1),
    store: z.object({ slug: z.string().startsWith('sample-'), name: z.string().startsWith('Sample ') }).strict(),
    switchDaysAgo: z.int().min(10).max(90),
    openingBalanceMinor: z.int(),
    entries: z.array(
      z
        .object({
          kind: z.enum(['BILL', 'PAYMENT', 'RETURN_CREDIT']),
          eventId: id,
          day: z.int().min(0),
          amountMinor: z.int(),
          externalOrderId: id.optional(),
          consignmentId: id.optional(),
          lineId: id.optional(),
          paymentRef: id.optional(),
          source: z.enum(['WEBHOOK', 'ANSWER']),
        })
        .strict(),
    ),
    difference: z.object({ daysAgo: z.int().min(1), eventId: id, externalOrderId: id, consignmentId: id, shopMinor: z.int().min(1), erpMinor: z.int().min(1), erpRowId: id }).strict(),
    hold: z.object({ reason: id }).strict(),
  })
  .strict()
  .refine((s) => s.entries.every((e) => e.day < s.switchDaysAgo - s.difference.daysAgo), { message: 'every sample entry falls before the day with the differences' });

/** The sample v6 store's data file, checked. */
export const sampleErpV6 = sampleSchema.parse(sampleJson);

export class SampleErpV6Refused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SampleErpV6Refused';
  }
}

export interface SampleErpV6Report {
  storeId: number;
  created: boolean;
  linkId: string | null;
  days: number;
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const at = (day: string): Date => new Date(`${day}T00:00:00Z`);

/**
 * Seeds the sample v6 store (see the head of the file). `setStoreSetting` writes the store's `erp.model` the way the
 * settings resolver does (the CLI passes the resolver; tests pass their own store).
 */
export async function seedSampleErpV6(deps: InventoryDeps, o: { setStoreSetting: (key: 'erp.model', value: 'v6', storeId: number) => Promise<void> }): Promise<SampleErpV6Report> {
  const db = deps.db;
  const s = sampleErpV6;
  const mark = await db.defaultPackApplication.findFirst({ where: { packKey: SAMPLE_PACK_KEY, storeId: { not: null } }, orderBy: { createdAt: 'asc' } });
  if (!mark?.storeId) throw new SampleErpV6Refused('no sample store: run the sample catalogue seed first (pnpm --filter @extas/seed sample); this never runs on an owner installation');
  const had = await db.store.findUnique({ where: { slug: s.store.slug }, select: { id: true } });
  if (had) return { storeId: had.id, created: false, linkId: (await storeErpLink(db, had.id))?.id ?? null, days: 0 };

  // a store like the sample catalogue store (its language, money and time zone), with its own practice-ERP connection
  const like = await db.store.findUniqueOrThrow({ where: { id: mark.storeId }, select: { defaultLocale: true, currency: true, timezone: true } });
  const store = await db.store.create({ data: { slug: s.store.slug, name: s.store.name, defaultLocale: like.defaultLocale, currency: like.currency, timezone: like.timezone } });
  await o.setStoreSetting('erp.model', 'v6', store.id);
  const integration = await db.integration.create({ data: { storeId: store.id, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'MOCK', enabled: true, config: {}, secretNames: [] } });
  await setErpMode(deps, { actor: SYSTEM, storeId: store.id }, { mode: 'EXTAS_ERP', integrationId: integration.id });

  const today = storeDate(nowOf(deps), like.timezone);
  const yesterday = addDay(today, -1);
  const start = addDay(today, -s.switchDaysAgo);
  const badDay = addDay(today, -s.difference.daysAgo);
  const opened = await openErpLink(db, store.id, integration.id);
  await db.erpStoreLink.update({ where: { id: opened.id }, data: { switchDate: at(start) } });
  await importOpeningBalance(deps, { storeId: store.id, amountMinor: s.openingBalanceMinor, date: start });
  const link = (await storeErpLink(db, store.id))!;

  const d = s.difference;
  const drafts: EntryDraft[] = [
    ...s.entries.map((e) => ({ ...e, businessDate: addDay(start, e.day) })).map(({ day: _day, ...e }) => e),
    { kind: 'BILL', eventId: d.eventId, businessDate: badDay, amountMinor: d.shopMinor, externalOrderId: d.externalOrderId, consignmentId: d.consignmentId, source: 'ANSWER' },
  ];
  await db.$transaction((tx) => appendAccountEntries(tx, link, drafts));

  // day closes, as the engine writes them: each hashed on the chain head; the day with the differences is a mismatch
  const now = nowOf(deps);
  const run = await db.booksMatchRun.create({ data: { storeId: store.id, linkId: link.id, trigger: 'NIGHTLY', fromDate: at(start), toDate: at(yesterday), status: 'DONE', startedAt: now, finishedAt: now, differences: 2, checks: {} } });
  const billSeq = (await db.erpAccountEntry.findFirstOrThrow({ where: { linkId: link.id, eventId: d.eventId }, select: { seq: true } })).seq;
  let prev: string | null = null;
  let days = 0;
  for (let day = start; day <= yesterday; day = addDay(day, 1)) {
    const bal = await balanceOn(db, link, day);
    const bad = day === badDay;
    const groups = bad ? [{ group: `BILL|${d.externalOrderId}`, check: 'ORDERS', shopMinor: d.shopMinor, erpMinor: d.erpMinor, entries: [{ seq: billSeq, kind: 'BILL', eventId: d.eventId, amountMinor: d.shopMinor, source: 'ANSWER', adjustmentId: null }], erpRows: [{ id: d.erpRowId, kind: 'BILL', amountMinor: d.erpMinor, eventId: null, reference: d.consignmentId }] }] : [];
    const off = d.shopMinor - d.erpMinor;
    const checks = ['ACCOUNT', 'TIES', 'RETURNS', 'SUMMARY', 'FIXED_COSTS', 'ORDERS'].map((c) => ({ check: c, result: bad && (c === 'TIES' || c === 'ORDERS') ? 'MISMATCH' : c === 'SUMMARY' || c === 'FIXED_COSTS' ? 'PARTIAL' : 'MATCHED', counts: {} }));
    const tie = { balanceStartMinor: bal.startMinor, balanceEndMinor: bal.endMinor, goodsMinor: 0, returnLossesMinor: 0, pipelineStartMinor: 0, pipelineEndMinor: bal.endMinor - bal.startMinor - (bad ? off : 0), switchTransferMinor: 0, paymentsMinor: 0, adjustmentsMinor: 0, remainderMinor: bad ? off : 0, summaryUsed: false };
    const result: BooksResult = bad ? 'MISMATCH' : 'PARTIAL';
    const erpClosing = bal.endMinor - (day >= badDay ? off : 0);
    const figures = { checks, groups, tie, erp: { startMinor: bal.startMinor, closingMinor: erpClosing }, pipeline: { startMinor: 0, endMinor: 0, waitingCheckMinor: 0, pieces: 0 }, digest: sha(day) };
    const row = { linkId: link.id, date: at(day), version: 1, result, openingBalanceMinor: BigInt(bal.startMinor), closingBalanceMinor: BigInt(bal.endMinor), figures };
    const hash: string = sha(`${prev ?? ''}\n${closeCanonical(row)}`);
    await db.booksDayClose.create({ data: { ...row, storeId: store.id, runId: run.id, erpClosingBalanceMinor: BigInt(erpClosing), goodsMinor: 0n, returnLossesMinor: 0n, pipelineStartMinor: 0n, pipelineEndMinor: 0n, paymentsMinor: 0n, tieRemainderMinor: BigInt(tie.remainderMinor), prevHash: prev, hash } });
    prev = hash;
    days++;
  }
  const diff = (check: BooksCheck, kind: BooksDifferenceClass, key: string, detail: Record<string, unknown>, extra: { externalOrderId?: string } = {}) =>
    db.booksDifference.create({ data: { storeId: store.id, linkId: link.id, date: at(badDay), check, kind, key, status: 'MISMATCH', amountMinor: BigInt(d.shopMinor - d.erpMinor), detail: detail as never, firstRunId: run.id, lastRunId: run.id, firstSeenAt: now, lastSeenAt: now, ...extra } });
  await diff('ORDERS', 'AMOUNT_DIFF', `F:BILL|${d.externalOrderId}`, { group: `BILL|${d.externalOrderId}`, shopMinor: d.shopMinor, erpMinor: d.erpMinor, erpRefs: [d.erpRowId], shopRefs: [d.eventId] }, { externalOrderId: d.externalOrderId });
  await diff('TIES', 'TIE_BROKEN', 'B:tie', { remainderMinor: d.shopMinor - d.erpMinor });

  // the first week and the lifetime check of the first days, as the engine writes them
  const opening = s.openingBalanceMinor;
  await db.$transaction((tx) => writePeriodClose(tx, link, { level: 'WEEK', start, end: addDay(start, 6), result: 'PARTIAL', openingMinor: opening, closingMinor: opening, matchedDays: 7, totalDays: 7, figures: { days: [], chained: true, digest: sha(`week ${start}`) } }));
  await db.$transaction((tx) => writePeriodClose(tx, link, { level: 'LIFETIME', start, end: addDay(start, 2), result: 'PARTIAL', openingMinor: opening, closingMinor: opening, matchedDays: 3, totalDays: 3, figures: { shopClosingMinor: opening, erpClosingMinor: opening, days: 3, matchedDays: 3, chained: true, digest: sha(`lifetime ${start}`) } }));

  // the ERP holds the store's account (its last check: the ERP's balance a paisa below the shop's)
  await noteHold(db, store.id, link.id, { onHold: true, reason: s.hold.reason, holdsOn: today, balanceMinor: (await ledgerBalance(db, link)) - (d.shopMinor - d.erpMinor), waitingCheckMinor: 0, exchangesAtRiskMinor: 0, checked: true }, now);
  return { storeId: store.id, created: true, linkId: link.id, days };
}
