// CN-028 · PR 615 — keeping Retail's ERP account up to date (docs/RETAIL-ERP-MODEL.md §3.1, follow-up 490).
//
// - `syncErpAccount` {storeId}: the shop's own work, no ERP call — every billed order without a bill gets one, every
//   money event of the event ledger gets its entry (a correction: a reversal plus the new effect), and the pipeline
//   moves from the shop's records (erp-pipeline.ts). Safe to run again at any time; the webhook path and the pull path
//   both end here.
// - `checkErpAccount` {storeId}: job `inventory.books.checkAccount`, every `erp.account.checkMinutes` for each store that
//   speaks v6. It runs `syncErpAccount`, then reads `GET /account` for the last `books.account.lookbackDays` days:
//   * a PAYMENT row of the ERP's statement whose eventId the shop has never seen (its `payment.recorded` webhook was
//     lost, and the hourly pull only reads returns and exchanges) is kept as that ERP event (source PULL) and booked by
//     the normal path. The webhook arriving later is the same event: no second entry, no conflict. Only money paid (a
//     negative row) is taken; a reversing row waits for its own event (money review: never a second payment), and holds
//     back only the payment it corrects (round 3: `held`, with the reason, shown by the books match).
//   * the hold (`account.hold` / `account.released` lost too) and the ERP's balance, waiting-check and exchanges at risk
//     go into ErpAccountState (a cache of the ERP's answer, with the moment the hold started or ended) through PR 610's
//     `noteHold`, the one writer of that row (PR 610's order check reads `GET /account` too, for the held orders). The
//     books never read their balance from there: the ledger is the shop's own.
//   * Amounts are read exactly (`moneyMinor`): one with a third decimal or words is left out, never rounded or read as 0
//     (the books match then shows the ERP's row the shop could not take).
// Nothing here moves money; in `erp.model` v5 nothing runs. CN-029 §16: the store's own connection and key, its own link.
import { nowOf, setting, type InventoryDeps } from './context';
import { InventoryError } from './errors';
import { ledgerBalance, moneyMinor, storeBooks, storeErpLink, syncBills, ingestAccountEvents, type BooksLink } from './erp-account';
import { applyErpEvents, FROM_STATEMENT, recordErpEvent } from './erp-events';
import { noteHold } from './erp-orders-v6';
import { syncPipeline } from './erp-pipeline';
import { storeDate } from './erp-events-pull';
import { openErpLink } from './erp-link';
import { isV6 } from './erp-model';
import { behaviourOf, resolveErp } from './guard';
import { checkCompany } from './mapping';
import { callErp, errorCode, errorText, retryPolicy } from './sync';

export interface AccountSyncResult {
  status: 'ok' | 'skipped';
  reason: 'ERP_MODEL_V5' | 'NO_LINK' | null;
  bills: number;
  events: number;
  entries: number;
  pieces: number;
  moves: number;
}

/** The shop's own side of the account, up to date (no ERP call). */
export async function syncErpAccount(deps: InventoryDeps, job: { storeId: number }): Promise<AccountSyncResult> {
  const out: AccountSyncResult = { status: 'ok', reason: null, bills: 0, events: 0, entries: 0, pieces: 0, moves: 0 };
  if (!(await isV6(deps, job.storeId))) return { ...out, status: 'skipped', reason: 'ERP_MODEL_V5' };
  const link = await storeErpLink(deps.db, job.storeId);
  if (!link) return { ...out, status: 'skipped', reason: 'NO_LINK' };
  return { ...out, ...(await syncLink(deps, link)) };
}

async function syncLink(deps: InventoryDeps, link: BooksLink): Promise<Omit<AccountSyncResult, 'status' | 'reason'>> {
  const ctx = await storeBooks(deps.db, link.storeId);
  const bills = await syncBills(deps, link, ctx.timeZone);
  const ev = await ingestAccountEvents(deps, link, ctx);
  const pipe = await syncPipeline(deps, link, ctx.timeZone);
  return { bills, events: ev.events, entries: ev.entries + bills, pieces: pipe.pieces, moves: pipe.moves };
}

export interface AccountCheckResult extends Omit<AccountSyncResult, 'status' | 'reason'> {
  status: 'ok' | 'skipped' | 'failed';
  reason: string | null;
  /** PAYMENT rows of the ERP's statement kept as their ERP event (and booked) because their webhook never came. */
  caughtUp: number;
  /** The ERP's payments held back from the catch-up as part of a correction on its way, with why (round 3). */
  held: HeldPayment[];
  /**
   * PAYMENT rows of the statement not taken: a reversing (+) row, an amount the books cannot read, or a row that looks
   * like part of a correction (its eventId on more than one row, a reversing row the same day); their own event brings them.
   */
  notTaken: number;
  onHold: boolean | null;
  /** The ERP's balance and the shop's ledger balance, minor units (the books match, PR 616, judges them). */
  erpBalanceMinor: number | null;
  shopBalanceMinor: number | null;
  error?: { code: string; text: string };
}

/** Why a payment of the ERP's statement was not caught up (round 3): its eventId on two rows, a correction on its way. */
export type CatchUpHeldReason = 'TWO_ROWS' | 'CORRECTION_IN_FLIGHT' | 'CORRECTION_SAME_REFERENCE' | 'SAME_AMOUNT_REVERSAL';
export interface HeldPayment {
  eventId: string;
  date: string;
  amountMinor: number;
  reason: CatchUpHeldReason;
}

const blank = (): AccountCheckResult => ({ status: 'ok', reason: null, bills: 0, events: 0, entries: 0, pieces: 0, moves: 0, caughtUp: 0, notTaken: 0, held: [], onHold: null, erpBalanceMinor: null, shopBalanceMinor: null });

const minorText = (v: unknown, digits: number): number | null => (v == null ? null : moneyMinor(String(v), digits));

/** The account check: the shop's side, then the ERP's statement and hold (follow-up 490). */
export async function checkErpAccount(deps: InventoryDeps, job: { storeId: number }): Promise<AccountCheckResult> {
  const { storeId } = job;
  const result = blank();
  if (!(await isV6(deps, storeId))) return { ...result, status: 'skipped', reason: 'ERP_MODEL_V5' };
  const erp = await resolveErp(deps, storeId);
  if (behaviourOf('events.pull', erp) === 'skip') return { ...result, status: 'skipped', reason: erp.state === 'none' ? 'ERP_NONE' : 'ERP_ON_PRACTICE' };
  const fail = (e: unknown): AccountCheckResult => ({ ...result, status: 'failed', error: { code: errorCode(e), text: errorText(e) } });
  if (erp.state === 'unavailable') return fail(new InventoryError('ERP_UNAVAILABLE', `${erp.code}: ${erp.reason}`));
  if (erp.state === 'none') return { ...result, status: 'skipped', reason: 'ERP_NONE' };
  const reads = erp.api.v6;
  const integrationId = erp.integrationId;
  if (!reads || !integrationId) return fail(new InventoryError('ERP_UNAVAILABLE', 'this ERP connection has no v6 reads'));
  try {
    const policy = await retryPolicy(deps);
    const health = (await callErp(deps, policy, (o) => erp.api.health(o))).value;
    await checkCompany(deps, erp, health);
    await openErpLink(deps.db, storeId, integrationId, { erpCompanyId: erp.state === 'mock' ? null : health.companyId });
    const link = await storeErpLink(deps.db, storeId);
    if (!link) return { ...result, status: 'skipped', reason: 'NO_LINK' };
    Object.assign(result, await syncLink(deps, link));

    const [{ timeZone, digits }, lookback] = await Promise.all([storeBooks(deps.db, storeId), setting(deps, storeId, 'books.account.lookbackDays')]);
    const now = nowOf(deps);
    const acct = (await callErp(deps, policy, (o) => reads.account({ from: storeDate(now, timeZone, -lookback), to: storeDate(now, timeZone) }, o))).value;

    // Follow-up 490: the ERP's payments the shop never heard of. PR 615 money review: only money paid (a negative row)
    // is a payment; it is kept as the ERP event it stands for (`payment.recorded`, source PULL, marked as taken from the
    // statement) and booked by the normal path, so its real webhook later is the same event and a later correction of it
    // finds its original. A positive row reverses a payment the statement does not name: it is never booked from here
    // (it would count as a second payment and take the correction's key); its own event brings it (`notTaken`).
    // Round 2: only a plain payment is caught up — an eventId with exactly one statement row in the window, money paid,
    // and no reversing row that corrects it. Anything that looks like a correction is left to its own webhook or the
    // pull: booked from here it would be a second payment, and the real event (which `reverses` the original) a conflict
    // never applied. Round 3: a reversing (+) row holds back only the payment it corrects, never a whole day —
    // - one the ledger already has (its eventId booked as a REVERSAL, or it names an event the ledger reversed): none;
    // - one naming a payment the ledger has and has not reversed (that payment's correction is on its way): a payment of
    //   the same day and the same reference (both without one alike) — the correction's new effect;
    // - one with a reference: a payment of that reference;
    // - one the ledger cannot tie: only a payment of its amount.
    // A payment held back is named with its reason (`held`; the books match shows it on the ERP's row, books-match.ts),
    // and is caught up by a later check once what held it is booked.
    const payRows = acct.statement.filter((r) => r.kind === 'PAYMENT').map((r) => ({ ...r, minor: minorText(r.amount, digits) }));
    const rowsOf = new Map<string, number>();
    for (const r of payRows) if (r.eventId) rowsOf.set(r.eventId, (rowsOf.get(r.eventId) ?? 0) + 1);
    const ids = [...new Set(payRows.map((r) => r.eventId).filter((x): x is string => !!x))];
    const known = ids.length ? await deps.db.erpAccountEntry.findMany({ where: { linkId: link.id, OR: [{ eventId: { in: ids } }, { reverses: { in: ids } }] }, select: { eventId: true, kind: true, reverses: true, paymentRef: true } }) : [];
    const bookedReversal = new Set(known.filter((e) => e.kind === 'REVERSAL').map((e) => e.eventId));
    const reversedOriginal = new Set(known.map((e) => e.reverses).filter((x): x is string => !!x));
    const payment = new Map(known.filter((e) => e.kind === 'PAYMENT').map((e) => [e.eventId, e]));
    const reversing = payRows.filter((r) => (r.minor ?? 0) > 0 && !(r.eventId && (bookedReversal.has(r.eventId) || reversedOriginal.has(r.eventId))));
    const heldBy = (c: { eventId: string; date: string; reference?: string | null; minor: number }): CatchUpHeldReason | null => {
      if ((rowsOf.get(c.eventId) ?? 0) !== 1) return 'TWO_ROWS';
      for (const r of reversing) {
        const of = r.eventId ? payment.get(r.eventId) : undefined;
        if (of) {
          if (r.date === c.date && (of.paymentRef ?? null) === (c.reference ?? null)) return 'CORRECTION_IN_FLIGHT';
        } else if (r.reference) {
          if (r.reference === c.reference) return 'CORRECTION_SAME_REFERENCE';
        } else if (r.minor === -c.minor) return 'SAME_AMOUNT_REVERSAL';
      }
      return null;
    };
    const caught: string[] = [];
    for (const row of payRows) {
      if (!row.eventId) continue;
      const seen = await deps.db.erpEvent.findUnique({ where: { linkId_eventId: { linkId: link.id, eventId: row.eventId } }, select: { id: true } });
      if (seen) continue;
      const minor = row.minor;
      if (minor === 0) continue;
      if (minor == null || minor > 0) {
        result.notTaken++;
        continue;
      }
      const reason = heldBy({ eventId: row.eventId, date: row.date, reference: row.reference ?? null, minor });
      if (reason) {
        result.notTaken++;
        result.held.push({ eventId: row.eventId, date: row.date, amountMinor: minor, reason });
        continue;
      }
      const rec = await recordErpEvent(deps, {
        integrationId,
        storeId,
        linkId: link.id,
        source: 'PULL',
        event: { eventId: row.eventId, type: 'payment.recorded', occurredAt: null, date: row.date, reverses: null, data: { amount: String(row.amount).trim().replace(/^-/, ''), reference: row.reference ?? null, [FROM_STATEMENT]: true } },
      });
      if (rec.created) caught.push(rec.id);
    }
    if (caught.length) {
      await applyErpEvents(deps, { ids: caught });
      const ev = await ingestAccountEvents(deps, link, { timeZone, digits });
      result.events += ev.events;
      result.entries += ev.entries;
    }
    result.caughtUp = caught.length;

    // The hold and the ERP's own numbers (ErpAccountState: one row per link, written by PR 610's `noteHold`). A number
    // the books cannot read exactly keeps the one before.
    const hold = acct.hold;
    const kept = (v: unknown) => minorText(v, digits) ?? undefined;
    await noteHold(
      deps.db,
      storeId,
      link.id,
      {
        onHold: hold.onHold,
        reason: hold.reason ?? null,
        holdsOn: hold.holdsOn ?? null,
        warnFromDays: hold.warnFromDays ?? null,
        lastPaymentAt: hold.lastPaymentAt ?? null,
        daysSinceLastPayment: hold.daysSinceLastPayment ?? null,
        balanceMinor: kept(acct.balance),
        waitingCheckMinor: kept(acct.waitingCheck),
        exchangesAtRiskMinor: kept(acct.exchangesAtRisk),
        checked: true,
      },
      now,
    );
    result.onHold = hold.onHold;
    result.erpBalanceMinor = minorText(acct.balance, digits);
    result.shopBalanceMinor = await ledgerBalance(deps.db, link);
    return result;
  } catch (e) {
    return fail(e);
  }
}
