// PR 499 — the ERP-absent guard: the one place that answers "is there an ERP for this store, and which one?", and the
// table of what every ERP-dependent path does in each answer. It keeps the "no ERP" seam open (S27, the no-ERP stock
// module, is parked): a store can run with no ERP at all, and nothing breaks.
//
// The four answers:
// - `none`        — the store's mode is "no ERP". Nothing is asked of any ERP.
// - `mock`        — an ERP is chosen, but its keys are not in yet (or its test failed): the adapter runs on the practice
//                   ERP. Its stock is never used for the real shop unless `erp.mock.stockEnabled` is on (tests, demos).
// - `connected`   — an ERP is chosen and its connection is in SANDBOX or LIVE.
// - `unavailable` — an ERP is chosen but cannot be used: its connection is gone, or no adapter for it exists in code
//                   (e.g. "another ERP" before its adapter is written). Treated like an ERP that is down.
import { EXTAS_ERP_PROVIDER, type ErpApi, type Mode } from '@extas/adapters';
import { setting, type InventoryDeps } from './context';
import { readErpSetup, type ErpSetup } from './erp-mode';

export type ErpLink =
  | { state: 'none'; setup: ErpSetup }
  | { state: 'unavailable'; setup: ErpSetup; code: 'CONNECTION_MISSING' | 'ADAPTER_MISSING' | 'NOT_CONFIGURED'; reason: string }
  | {
      state: 'mock' | 'connected';
      setup: ErpSetup;
      api: ErpApi;
      provider: string;
      adapterMode: Mode;
      integrationId: string | null;
      /** May this ERP's stock be used? Always for a real connection; for the practice ERP only with the setting on. */
      stockEnabled: boolean;
    };

export type ErpLinkState = ErpLink['state'];

/** Which ERP serves this store right now. Never throws for a missing ERP: that is an answer, not an error. */
export async function resolveErp(deps: InventoryDeps, storeId: number): Promise<ErpLink> {
  const setup = await readErpSetup(deps.db, deps.settings, storeId);
  if (setup.mode === 'NONE') return { state: 'none', setup };
  let provider: string;
  if (setup.integrationId) {
    const row = await deps.db.integration.findUnique({ where: { id: setup.integrationId }, select: { provider: true, kind: true, archivedAt: true } });
    if (!row || row.kind !== 'ERP' || row.archivedAt) return { state: 'unavailable', setup, code: 'CONNECTION_MISSING', reason: 'the chosen ERP connection is gone' };
    provider = row.provider;
  } else if (setup.mode === 'EXTAS_ERP') {
    provider = EXTAS_ERP_PROVIDER;
  } else {
    return { state: 'unavailable', setup, code: 'CONNECTION_MISSING', reason: 'another ERP is chosen but no connection is named' };
  }
  try {
    const c = await deps.connections.use<ErpApi>('ERP', { storeId, provider });
    const mock = c.mode === 'MOCK';
    return {
      state: mock ? 'mock' : 'connected',
      setup,
      api: c.api,
      provider: c.provider,
      adapterMode: c.mode,
      integrationId: c.integrationId,
      stockEnabled: mock ? await setting(deps, null, 'erp.mock.stockEnabled') : true,
    };
  } catch (e) {
    const reason = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    return { state: 'unavailable', setup, code: /^no adapter/.test(reason) ? 'ADAPTER_MISSING' : 'NOT_CONFIGURED', reason };
  }
}

/**
 * What each ERP-dependent path does in each state. This table is the contract of the seam: the tests walk every row and
 * prove the code does what it says. A new ERP-dependent path adds its row here (and its test) before it is built.
 *
 * - skip       — does nothing and says why; the shop's own data stays exactly as it is.
 * - fail       — records a failed run (the health panel shows it) and changes nothing.
 * - run        — talks to the ERP.
 * - mirror     — answers from the shop's own stock copy.
 * - hold       — keeps the document waiting; it goes out when a real ERP connection is there.
 * - send       — sends the document.
 * - refuse     — the admin action answers ERP_NOT_CONNECTED / ERP_UNAVAILABLE.
 * - practice   — answers from the practice ERP, marked as practice; nothing of it is saved as real.
 */
export const ERP_DEPENDENT_PATHS = {
  /** PR 195 — the scheduled stock pull. On the practice ERP it runs only with `erp.mock.stockEnabled`. */
  'stock.pull': { none: 'skip', mock: 'skip', unavailable: 'fail', connected: 'run' },
  /** PR 195 — the checkout's last stock check: one quick try, else the shop's copy. */
  'stock.liveCheck': { none: 'mirror', mock: 'mirror', unavailable: 'mirror', connected: 'run' },
  /** PR 199, 200 — order, payment, shipment, return and ad-spend documents (ErpPush). */
  'documents.push': { none: 'skip', mock: 'hold', unavailable: 'hold', connected: 'send' },
  /** PR 196 — "which company does the key belong to?". The practice company is shown, never saved. */
  'company.verify': { none: 'refuse', mock: 'practice', unavailable: 'refuse', connected: 'run' },
  /** PR 196 — the ERP warehouses to link local warehouses to. */
  'warehouses.discover': { none: 'skip', mock: 'practice', unavailable: 'refuse', connected: 'run' },
  /** PR 206 — "re-sync now" (all stock) and "re-sync this product" from the admin. */
  'stock.resync': { none: 'refuse', mock: 'skip', unavailable: 'refuse', connected: 'run' },
  /** PR 207 — the full check of every stock number against the ERP (changes nothing). */
  'stock.reconcile': { none: 'skip', mock: 'skip', unavailable: 'fail', connected: 'run' },
  /** PR 204 — ERP styles the shop does not have yet, for the publishing queue. */
  'variants.discover': { none: 'skip', mock: 'practice', unavailable: 'refuse', connected: 'run' },
} as const satisfies Record<string, Record<ErpLinkState, string>>;

export type ErpDependentPath = keyof typeof ERP_DEPENDENT_PATHS;

/** Paths that read the ERP's stock: on the practice ERP they run once its stock is switched on (`erp.mock.stockEnabled`). */
const STOCK_PATHS: ReadonlySet<ErpDependentPath> = new Set(['stock.pull', 'stock.liveCheck', 'stock.resync', 'stock.reconcile']);

/** The behaviour of a path for a link (`mock` with the practice stock switched on behaves like `connected`). */
export function behaviourOf(path: ErpDependentPath, link: ErpLink): string {
  if (link.state === 'mock' && link.stockEnabled && STOCK_PATHS.has(path)) return 'run';
  return ERP_DEPENDENT_PATHS[path][link.state];
}

/** What a business document push (PR 199/200) does now: the ErpPush row's status follows from it. */
export type PushDisposition = 'skip' | 'hold' | 'send';

export async function pushDisposition(deps: InventoryDeps, storeId: number): Promise<{ disposition: PushDisposition; pushStatus: 'SKIPPED_NO_ERP' | 'PENDING'; link: ErpLinkState }> {
  const link = await resolveErp(deps, storeId);
  const disposition = ERP_DEPENDENT_PATHS['documents.push'][link.state];
  return { disposition, pushStatus: disposition === 'skip' ? 'SKIPPED_NO_ERP' : 'PENDING', link: link.state };
}
