// CN-028 · PR 616 — putting a difference of the books right (docs/RETAIL-ERP-MODEL.md §4.3). The owner's rule: a
// difference is fixed only by a reversing entry plus a new entry, never by editing or deleting a number.
//
// `adjustDifference` needs `books.adjust` (Accounts or the owner), the owner's PIN typed at that moment, a reason (at
// least `books.adjust.reasonMinLength` letters) and the ERP's matching event: one of the rows the difference names (the
// ERP's, or the group's own entries), or an event of the store's ERP ledger about the same order. In one transaction —
// the link locked first, then the difference claimed (qa-gate: two corrections at the same moment, one books and the
// other is ALREADY; the database keeps one correction per difference) — it writes:
//   1. a REVERSAL of every entry of the difference's row group that is not reversed yet (same refs, opposite amount);
//   2. one ADJUSTMENT entry carrying what the ERP has for that group (none when the ERP has nothing);
//      a bill the shop never booked (the shipment's answer had no bill date: PR 611 keeps `billedAt` empty, never a
//      guessed day) is booked as the BILL itself under its own key, on the ERP's day, so it is never booked twice;
//   3. a BooksAdjustment row (kind ADJUSTMENT, or PRIOR_PERIOD dated today when the day's month is closed) that names the
//      difference, the ERP event (one adjustment per ERP event, ever) and that the PIN was checked;
// and marks the difference FIXED with that adjustment. The original entry stays as it was; the ledger's chain goes on.
// Only differences of row groups can be put right this way (checks A and F: AMOUNT_DIFF, UNKNOWN_ROW, MISSING_EVENT);
// a tie, a returns count, a summary, a payment, the opening or closing balance or a moved history is found again from
// the books (NOT_ADJUSTABLE). The next run re-closes the corrected day, however far back it lies (books-match.ts).
// qa-gate round 2 (spec §4.3, "a MISSING_EVENT is fetched by the pull, nothing typed by hand"): while a row of the group
// names an ERP event the shop's ledger has not got yet (`detail.waitingEvents`, checked again under the lock), the
// difference waits for the pull — a correction now would be counted a second time when the event arrives under its own
// key. ~~A row with no event behind it (a charge the ERP typed) and a bill the shop never booked (its own key, below) are
// still put right by hand. A difference kept before this rule (no `erpEvents`) that the ERP has and the shop lacks waits
// too, unless it is a bill; the next run writes its list.~~
// qa-gate round 3: v6 does not promise an eventId on a statement row (contract-v6.ts, `statement[].eventId` optional;
// a stable id per row is a v7 request), so "no eventId" never means "no event behind it". The row's kind decides: a
// MISSING_EVENT of a group whose rows come from events (CREDIT, PAYMENT, EXCHANGE) always waits for the pull; only a
// group with no event behind it (OTHER: a charge the ERP typed, the switch transfer) and a bill the shop never booked
// (its own key, below) are put right by hand. The eventId check above stays as a second guard where ids are sent.
// Everything is on the store's own link: a difference of store A is not found from store B (NOT_FOUND).
import { entryKey, minorOf } from '@extas/erp-types';
import { z } from 'zod';
import { logChange, nowOf, parse, TX, type InventoryDeps, type Who } from './context';
import { BooksError } from './books-errors';
import { checkBooksPin, needPin, reasonOf } from './books-close';
import { eventsNotBooked } from './books-match';
import { allowBooks, appendAccountEntries, billKey, booksLinkFor, dateOfDay, dayText, isP2002, lockLink, storeBooks, type EntryDraft } from './erp-account';
import { storeDate } from './erp-events-pull';

const adjustInput = z.object({ pin: z.string().max(64), reason: z.string().max(1000), erpEventId: z.string().trim().min(1).max(240) }).strict();
export type AdjustInput = z.input<typeof adjustInput>;

/** The classes a correction puts right (row groups of checks A and F). */
const ADJUSTABLE = new Set(['AMOUNT_DIFF', 'UNKNOWN_ROW', 'MISSING_EVENT']);

interface GroupDetail {
  group?: unknown;
  shopMinor?: unknown;
  erpMinor?: unknown;
  erpRefs?: unknown;
  shopRefs?: unknown;
  /** The ERP events behind the group's rows (books-match.ts); absent on a difference kept before qa-gate round 2. */
  erpEvents?: unknown;
  /** Those of them the shop's ledger has no entry for yet: the pull brings them. */
  waitingEvents?: unknown;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Whether a difference can be put right by a correction (the page shows the form only then). */
export function isAdjustable(d: { check: string; kind: string; key: string; status: string; detail: unknown }): boolean {
  const det = d.detail as GroupDetail | null;
  const g = det?.group;
  if (!((d.check === 'ACCOUNT' || d.check === 'ORDERS') && ADJUSTABLE.has(d.kind) && /^[AF]:/.test(d.key) && typeof g === 'string' && g !== 'OPENING' && g !== 'CLOSING' && (d.status === 'PENDING' || d.status === 'MISMATCH'))) return false;
  return !waitsForPull(d.kind, g, det);
}

/** Whether a difference waits for the pull to bring the ERP's event (see above), rather than a correction. */
export function waitsForPull(kind: string, group: string, detail: unknown): boolean {
  const det = detail as GroupDetail | null;
  if (strings(det?.waitingEvents).length) return true;
  return kind === 'MISSING_EVENT' && EVENT_GROUP.test(group);
}

/** Row groups whose ERP rows come from the ERP's money events (books-match.ts `erpRowGroup`): the pull brings them. */
const EVENT_GROUP = /^(CREDIT|PAYMENT|EXCHANGE)\|/;

/** Puts one difference right by reversing and adding (see above). Answers the adjustment. */
export async function adjustDifference(deps: InventoryDeps, who: Who, differenceId: string, input: AdjustInput): Promise<{ id: string; kind: 'ADJUSTMENT' | 'PRIOR_PERIOD'; amountMinor: number; date: string; entries: number }> {
  await allowBooks(deps, who, 'books.adjust');
  needPin(input?.pin);
  const d = parse(adjustInput, input, 'correction');
  const reason = await reasonOf(deps, d.reason, 'reason');
  if (!who.actor.staffUserId) throw new BooksError('INVALID_INPUT', 'a correction is made by a person', ['actor']);
  const link = await booksLinkFor(deps, who.storeId);
  if (!z.uuid().safeParse(differenceId).success) throw new BooksError('NOT_FOUND', 'no such difference', ['differenceId']);
  const diff = await deps.db.booksDifference.findFirst({ where: { id: differenceId, linkId: link.id, storeId: who.storeId } });
  if (!diff) throw new BooksError('NOT_FOUND', 'no such difference', ['differenceId']);
  if (diff.status === 'FIXED' || diff.status === 'OVERRIDDEN') throw new BooksError('ALREADY', 'this difference is already settled', ['differenceId']);
  if (!isAdjustable(diff)) throw new BooksError('NOT_ADJUSTABLE', 'this difference is found again from the books; it is not put right by a correction', ['differenceId']);
  const detail = diff.detail as GroupDetail;
  const group = detail.group as string;
  const erpMinor = typeof detail.erpMinor === 'number' ? detail.erpMinor : 0;
  const shopRefs = strings(detail.shopRefs);
  // The ERP's matching event belongs to this difference (qa-gate): a row it names (the ERP's or the group's own), or an
  // event of the store's ERP ledger about the same order.
  const named = strings(detail.erpRefs).includes(d.erpEventId) || shopRefs.includes(d.erpEventId);
  const sameOrder = !named && !!diff.externalOrderId && !!(await deps.db.erpEvent.findFirst({ where: { linkId: link.id, eventId: d.erpEventId, externalOrderId: diff.externalOrderId }, select: { id: true } }));
  if (!named && !sameOrder) throw new BooksError('INVALID_INPUT', "name the ERP's matching event of this difference", ['erpEventId']);
  if (await deps.db.booksAdjustment.findFirst({ where: { linkId: link.id, erpEventId: d.erpEventId }, select: { id: true } })) throw new BooksError('ALREADY', 'this ERP event is already used by a correction', ['erpEventId']);
  await checkBooksPin(deps, who, d.pin, 'books.adjust');

  const now = nowOf(deps);
  const { timeZone } = await storeBooks(deps.db, who.storeId);
  const day = dayText(diff.date);
  try {
    return await deps.db.$transaction(async (tx) => {
      // The link first (before any read that decides and any insert that names it), then the difference claimed: of two
      // corrections at the same moment the second waits here and finds it settled.
      await lockLink(tx, link);
      const claimed = await tx.booksDifference.updateMany({ where: { id: diff.id, linkId: link.id, storeId: who.storeId, status: { in: ['PENDING', 'MISMATCH'] } }, data: { status: 'FIXED', fixedAt: now } });
      if (claimed.count !== 1) throw new BooksError('ALREADY', 'this difference is already settled', ['differenceId']);
      // A day of a closed month is put right today (PRIOR_PERIOD); read under the lock, so a close at this moment counts.
      const month = await tx.booksPeriodClose.findFirst({ where: { linkId: link.id, level: 'MONTH', periodStart: { lte: diff.date }, periodEnd: { gte: diff.date } }, orderBy: { version: 'desc' }, select: { reopens: true } });
      const prior = !!month && month.reopens == null;
      const date = prior ? storeDate(now, timeZone) : day;
      // The ERP's events of this group must be in the ledger already (read under the lock): one still on its way is
      // booked by the pull under its own key, so a correction now would count it twice.
      if ((await eventsNotBooked(tx, link.id, strings(detail.erpEvents))).length) throw new BooksError('NOT_ADJUSTABLE', "the ERP's event for this row has not reached the shop yet; the pull brings it", ['differenceId']);
      // The group as it stands now (the difference was found from these entries; anything since means look again).
      const entries = shopRefs.length ? await tx.erpAccountEntry.findMany({ where: { linkId: link.id, eventId: { in: shopRefs } }, orderBy: { seq: 'asc' } }) : [];
      const shopNet = entries.reduce((s, e) => s + minorOf(e.amountMinor), 0);
      if (entries.length !== shopRefs.length || shopNet !== detail.shopMinor) throw new BooksError('CONFLICT', 'the books moved since this difference was found; run the match again', ['differenceId']);
      const undone = new Set((await tx.erpAccountEntry.findMany({ where: { linkId: link.id, reverses: { in: entries.map((e) => e.eventId) } }, select: { reverses: true } })).map((r) => r.reverses!));
      const toReverse = entries.filter((e) => e.kind !== 'REVERSAL' && !undone.has(e.eventId));
      const reversedMinor = toReverse.reduce((s, e) => s + minorOf(e.amountMinor), 0);
      const newMinor = erpMinor - shopNet + reversedMinor;
      const amountMinor = erpMinor - shopNet;
      const adj = await tx.booksAdjustment.create({
        data: { storeId: who.storeId, linkId: link.id, kind: prior ? 'PRIOR_PERIOD' : 'ADJUSTMENT', date: dateOfDay(date), amountMinor: BigInt(amountMinor), reason, erpEventId: d.erpEventId, differenceId: diff.id, pinVerified: true, createdById: who.actor.staffUserId! },
      });
      const drafts: EntryDraft[] = toReverse.map((e, i) => ({
        kind: 'REVERSAL',
        eventId: `${entryKey.adjustment(adj.id)}:rev:${i + 1}`,
        businessDate: date,
        amountMinor: -minorOf(e.amountMinor),
        externalOrderId: e.externalOrderId,
        lineId: e.lineId,
        returnListId: e.returnListId,
        consignmentId: e.consignmentId,
        exchangeId: e.exchangeId,
        paymentRef: e.paymentRef,
        source: 'MANUAL',
        reverses: e.eventId,
        adjustmentId: adj.id,
        createdById: who.actor.staffUserId,
      }));
      // A bill the shop never booked (the ERP's row is the only record) is booked as the BILL itself, on the ERP's day
      // and under the bill's own key, so the order check never books it a second time once `billedAt` arrives.
      const missingBill = diff.kind === 'MISSING_EVENT' && group.startsWith('BILL|') && !!diff.externalOrderId && newMinor > 0;
      if (missingBill) {
        const consignmentId = typeof (detail as { consignmentId?: unknown }).consignmentId === 'string' ? ((detail as { consignmentId: string }).consignmentId) : null;
        const already = await tx.erpAccountEntry.findFirst({ where: { linkId: link.id, kind: 'BILL', externalOrderId: diff.externalOrderId }, select: { id: true } });
        if (already) throw new BooksError('CONFLICT', 'the books moved since this difference was found; run the match again', ['differenceId']);
        drafts.push({ kind: 'BILL', eventId: billKey(diff.externalOrderId!, consignmentId), businessDate: date, amountMinor: newMinor, externalOrderId: diff.externalOrderId, consignmentId, source: 'MANUAL', adjustmentId: adj.id, createdById: who.actor.staffUserId });
      } else if (newMinor !== 0) drafts.push({ kind: 'ADJUSTMENT', eventId: entryKey.adjustment(adj.id), businessDate: date, amountMinor: newMinor, externalOrderId: diff.externalOrderId, source: 'MANUAL', adjustmentId: adj.id, createdById: who.actor.staffUserId });
      const written = await appendAccountEntries(tx, link, drafts);
      if (written.created.length !== drafts.length) throw new BooksError('CONFLICT', 'the books moved since this difference was found; run the match again', ['differenceId']);
      await tx.booksDifference.update({ where: { id: diff.id }, data: { adjustmentId: adj.id, entryId: written.created.at(-1)?.id ?? null } });
      await logChange(tx, who, {
        action: 'books.adjust',
        entityType: 'BooksAdjustment',
        entityId: adj.id,
        before: { differenceId: diff.id, group, shopMinor: shopNet, erpMinor },
        after: { kind: adj.kind, date, amountMinor, erpEventId: d.erpEventId, reason, reversed: toReverse.map((e) => e.eventId) },
        storeId: who.storeId,
      });
      return { id: adj.id, kind: adj.kind, amountMinor, date, entries: written.created.length };
    }, TX);
  } catch (e) {
    if (isP2002(e)) throw new BooksError('ALREADY', 'this ERP event is already used by a correction', ['erpEventId']);
    throw e;
  }
}
