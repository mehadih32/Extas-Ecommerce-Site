// PR 608 (CN-028) — the pull that catches every ERP event a webhook missed (docs/erp/site-changes-v6.md §2.5.4: "pull
// them with GET /returns?updatedSince= … every hour and on start-up"). Job `inventory.erp.pullEvents` {storeId}, every
// `erp.events.pullMinutes` for each store that speaks v6 (the scheduler plans the current slot when it starts, so a
// restart pulls at once).
//
// - `GET /returns?updatedSince=` and `GET /exchanges?status=all&updatedSince=`: every event they carry goes into the one
//   ledger (erp-events.ts) by its eventId, so an event already there by webhook is not stored again.
// - `GET /returns/claims?from&to` (the last `erp.events.claimsLookbackDays` days): the courier claims, one row per piece
//   and reason (refreshed, never doubled).
// - Each list keeps its own place (ErpSyncState `events.returns`, `events.exchanges`), read back with the overlap of
//   `erp.sync.updatedSinceOverlapSeconds` so a change at the edge is never missed (the ledger drops the repeat). As the
//   stock pull (PR 195) does, the place moves on only when a run reached the end of the list: a run stopped by
//   `erp.sync.maxPagesPerRun` saves its cursor (with the `updatedSince` it asked with and the newest change it saw) after
//   every page, and the next run carries on from there, so nothing on a later page is skipped, whatever order the
//   ERP lists in.
// - CN-029 §16: every run first asks `GET /health` which company the key belongs to (COMPANY_MISMATCH against the
//   store's mapping; SHARED_COMPANY when another store's open link holds it) and fills the store's link with it.
// Paths: `events.pull` in the ERP-absent guard (none → skip; practice → skip unless its data is switched on;
// unavailable → a failed run on the health panel; connected → run). In `erp.model` v5 it does nothing.
import { parseErpV6Event, type ErpExchange, type ErpReturnItem } from '@extas/adapters';
import { nowOf, setting, type InventoryDeps } from './context';
import { InventoryError } from './errors';
import { checkCompany } from './mapping';
import { isV6 } from './erp-model';
import { currencyDigits } from './erp-push';
import { recordErpEvent, upsertClaim } from './erp-events';
import { openErpLink } from './erp-link';
import { behaviourOf, resolveErp } from './guard';
import { callErp, errorCode, errorText, finishRun, readState, retryPolicy, saveState, startRun, type SyncResource } from './sync';
import { decimalToMinor } from './webhook';

export interface EventsPullResult {
  status: 'ok' | 'skipped' | 'failed';
  reason: string | null;
  runId: string | null;
  pages: number;
  /** Returned parcels and exchanges read. */
  items: number;
  /** Events read, and how many of them were new to the ledger. */
  events: number;
  newEvents: number;
  rejected: number;
  claims: number;
  complete: boolean;
  error?: { code: string; text: string };
}

/** A store's business date (its own time zone): the ERP's dates are Asia/Dhaka, the store's zone. */
export function storeDate(now: Date, timeZone: string, addDays = 0): string {
  const d = new Date(now.getTime() + addDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Where a list stopped (ErpSyncState.cursor): the ERP's cursor, the `updatedSince` asked with, the newest change seen. */
interface ResumePoint {
  cursor: string;
  since: string | null;
  maxSeen: string | null;
}

const encodeResume = (r: ResumePoint) => JSON.stringify(r);
function decodeResume(v: string | null | undefined): ResumePoint | null {
  if (!v) return null;
  try {
    const r = JSON.parse(v) as ResumePoint;
    const dateOrNull = (x: unknown) => x === null || x === undefined || (typeof x === 'string' && !Number.isNaN(Date.parse(x)));
    return typeof r.cursor === 'string' && dateOrNull(r.since) && dateOrNull(r.maxSeen) ? { cursor: r.cursor, since: r.since ?? null, maxSeen: r.maxSeen ?? null } : null;
  } catch {
    return null;
  }
}

const blank = (): EventsPullResult => ({ status: 'ok', reason: null, runId: null, pages: 0, items: 0, events: 0, newEvents: 0, rejected: 0, claims: 0, complete: true });

export async function pullErpEvents(deps: InventoryDeps, job: { storeId: number }): Promise<EventsPullResult> {
  const { storeId } = job;
  const result = blank();
  if (!(await isV6(deps, storeId))) return { ...result, status: 'skipped', reason: 'ERP_MODEL_V5' };
  const link = await resolveErp(deps, storeId);
  if (behaviourOf('events.pull', link) === 'skip') return { ...result, status: 'skipped', reason: link.state === 'none' ? 'ERP_NONE' : 'ERP_ON_PRACTICE' };

  const runId = await startRun(deps.db, storeId, 'events.pull', nowOf(deps));
  result.runId = runId;
  const fail = async (e: unknown, resource: SyncResource = 'events.returns'): Promise<EventsPullResult> => {
    const text = errorText(e);
    await saveState(deps.db, storeId, resource, { lastError: text });
    await finishRun(deps.db, runId, { ok: false, itemsOk: result.events, itemsFailed: result.rejected, error: text }, nowOf(deps));
    return { ...result, status: 'failed', complete: false, error: { code: errorCode(e), text } };
  };
  if (link.state === 'unavailable') return fail(new InventoryError('ERP_UNAVAILABLE', `${link.code}: ${link.reason}`));
  if (link.state === 'none') return { ...result, status: 'skipped', reason: 'ERP_NONE' };
  const reads = link.api.v6;
  const integrationId = link.integrationId;
  if (!reads || !integrationId) return fail(new InventoryError('ERP_UNAVAILABLE', 'this ERP connection has no v6 reads'));
  const policy = await retryPolicy(deps);
  // CN-029 §16: the guard gave the store's own connection (its own key): what it reads is this store's, on its open link,
  // which holds the company the key belongs to (never a company another store's link holds).
  let linkId: string;
  try {
    const health = (await callErp(deps, policy, (o) => link.api.health(o))).value;
    await checkCompany(deps, link, health);
    linkId = (await openErpLink(deps.db, storeId, integrationId, { erpCompanyId: link.state === 'mock' ? null : health.companyId })).id;
  } catch (e) {
    return fail(e);
  }

  const [pageSize, maxPages, overlapS, lookback, store] = await Promise.all([
    setting(deps, null, 'erp.sync.pageSize'),
    setting(deps, null, 'erp.sync.maxPagesPerRun'),
    setting(deps, null, 'erp.sync.updatedSinceOverlapSeconds'),
    setting(deps, null, 'erp.events.claimsLookbackDays'),
    deps.db.store.findUniqueOrThrow({ where: { id: storeId }, select: { currency: true, timezone: true } }),
  ]);

  const keep = async (events: ErpReturnItem['events']) => {
    for (const raw of events) {
      const p = parseErpV6Event(raw);
      if (!p.ok) {
        result.rejected++;
        continue;
      }
      result.events++;
      if ((await recordErpEvent(deps, { integrationId, storeId, linkId, source: 'PULL', event: p.event })).created) result.newEvents++;
    }
  };

  type Page = { items: (ErpReturnItem | ErpExchange)[]; nextCursor: string | null; rejected: unknown[] };
  const lists: { resource: SyncResource; read: (since: Date | null, cursor: string | null) => Promise<Page> }[] = [
    { resource: 'events.returns', read: (since, cursor) => callErp(deps, policy, (o) => reads.returns({ updatedSince: since, cursor, limit: pageSize }, o)).then((r) => r.value) },
    { resource: 'events.exchanges', read: (since, cursor) => callErp(deps, policy, (o) => reads.exchanges({ status: 'all', updatedSince: since, cursor, limit: pageSize }, o)).then((r) => r.value) },
  ];
  for (const list of lists) {
    try {
      const state = await readState(deps.db, storeId, list.resource);
      // A run stopped by the page cap carries on from its cursor, with the same `updatedSince` it asked with.
      const resume = decodeResume(state?.cursor);
      const since = resume ? (resume.since ? new Date(resume.since) : null) : state?.updatedSince ? new Date(state.updatedSince.getTime() - overlapS * 1000) : null;
      let maxSeen = resume?.maxSeen ? new Date(resume.maxSeen) : (state?.updatedSince ?? null);
      let cursor: string | null = resume?.cursor ?? null;
      let pages = 0;
      let complete = true;
      for (;;) {
        const page = await list.read(since, cursor);
        pages++;
        result.pages++;
        result.items += page.items.length;
        result.rejected += page.rejected.length;
        for (const item of page.items) {
          await keep(item.events);
          if (item.updatedAt && (!maxSeen || item.updatedAt > maxSeen)) maxSeen = item.updatedAt;
        }
        cursor = page.nextCursor;
        await saveState(deps.db, storeId, list.resource, {
          cursor: cursor ? encodeResume({ cursor, since: since ? since.toISOString() : null, maxSeen: maxSeen ? maxSeen.toISOString() : null }) : null,
        });
        if (!cursor) break;
        if (pages >= maxPages) {
          complete = false;
          result.complete = false;
          break;
        }
      }
      // The place moves on only when the whole list was read: a part-read list keeps its cursor for the next run.
      await saveState(deps.db, storeId, list.resource, { ...(complete ? { cursor: null, updatedSince: maxSeen } : {}), lastSuccessAt: nowOf(deps), lastError: null });
    } catch (e) {
      return fail(e, list.resource);
    }
  }

  try {
    const now = nowOf(deps);
    const claims = (await callErp(deps, policy, (o) => reads.returnClaims({ from: storeDate(now, store.timezone, -lookback), to: storeDate(now, store.timezone) }, o))).value;
    const digits = currencyDigits(store.currency);
    for (const c of claims) {
      await upsertClaim(
        deps.db,
        {
          storeId,
          linkId,
          integrationId,
          externalOrderId: c.externalOrderId,
          lineId: c.lineId,
          sku: c.sku,
          reason: c.reason,
          returnListId: c.returnListId,
          consignmentId: c.consignmentId,
          courier: c.courier,
          handedBackAt: c.handedBackAt,
          decidedAt: c.decidedAt,
          valueMinor: decimalToMinor(c.value, digits),
          source: 'PULL',
          eventId: null,
        },
        now,
      );
      result.claims++;
    }
    await saveState(deps.db, storeId, 'events.claims', { lastSuccessAt: now, lastError: null });
  } catch (e) {
    return fail(e, 'events.claims');
  }

  await finishRun(deps.db, runId, { ok: true, itemsOk: result.events, itemsFailed: result.rejected, error: null }, nowOf(deps));
  return result;
}
