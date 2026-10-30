// CN-028 · PR 615 — keeping Retail's ERP account up to date (docs/RETAIL-ERP-MODEL.md §3.1, follow-up 490).
//
// - `syncErpAccount` {storeId}: the shop's own work, no ERP call — every billed order without a bill gets one, every
//   money event of the event ledger gets its entry (a correction: a reversal plus the new effect), and the pipeline
//   moves from the shop's records (erp-pipeline.ts). Safe to run again at any time; the webhook path and the pull path
//   both end here.
// - `checkErpAccount` {storeId}: job `inventory.books.checkAccount`, every `erp.account.checkMinutes` for each store that
//   speaks v6. It runs `syncErpAccount`, then reads `GET /account` for the last `books.account.lookbackDays` days:
//   * a PAYMENT row of the ERP's statement whose eventId the shop has never seen (its `payment.recorded` webhook was
//     lost, and the hourly pull only reads returns and exchanges) is written into the ledger from the statement
//     (source PULL). The webhook arriving later is the same eventId: no second entry.
//   * the hold (`account.hold` / `account.released` lost too) and the ERP's balance, waiting-check and exchanges at risk
//     go into ErpAccountState (a cache of the ERP's answer, with the moment the hold started or ended) through PR 610's
//     `noteHold`, the one writer of that row (PR 610's order check reads `GET /account` too, for the held orders). The
//     books never read their balance from there: the ledger is the shop's own.
//   * Amounts are read exactly (`moneyMinor`): one with a third decimal or words is left out, never rounded or read as 0
//     (the books match then shows the ERP's row the shop could not take).
// Nothing here moves money; in `erp.model` v5 nothing runs. CN-029 §16: the store's own connection and key, its own link.
import { nowOf, setting, TX, type InventoryDeps } from './context';
import { InventoryError } from './errors';
import { appendAccountEntries, ledgerBalance, moneyMinor, storeBooks, storeErpLink, syncBills, ingestAccountEvents, type BooksLink } from './erp-account';
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
  /** PAYMENT rows of the ERP's statement written into the ledger because their webhook never came. */
  caughtUp: number;
  onHold: boolean | null;
  /** The ERP's balance and the shop's ledger balance, minor units (the books match, PR 616, judges them). */
  erpBalanceMinor: number | null;
  shopBalanceMinor: number | null;
  error?: { code: string; text: string };
}

const blank = (): AccountCheckResult => ({ status: 'ok', reason: null, bills: 0, events: 0, entries: 0, pieces: 0, moves: 0, caughtUp: 0, onHold: null, erpBalanceMinor: null, shopBalanceMinor: null });

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

    // Follow-up 490: the ERP's payments the shop never heard of.
    for (const row of acct.statement) {
      if (row.kind !== 'PAYMENT' || !row.eventId) continue;
      const minor = Math.abs(minorText(row.amount, digits) ?? 0);
      if (!minor) continue;
      const seen = await deps.db.erpEvent.findUnique({ where: { linkId_eventId: { linkId: link.id, eventId: row.eventId } }, select: { id: true } });
      if (seen) continue;
      const r = await deps.db.$transaction(
        (tx) => appendAccountEntries(tx, link, [{ kind: 'PAYMENT', eventId: row.eventId!, businessDate: row.date, amountMinor: -minor, paymentRef: row.reference ?? null, source: 'PULL' }]),
        TX,
      );
      result.caughtUp += r.created.length;
    }

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
