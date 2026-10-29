// S20 · PR 407 (Blueprint B2.1 locked: "generated automatically on every order") — the invoice run: every live store
// with the invoice on gets one `invoices.issue` per slot of `documents.invoice.issue.everyMinutes`; the slot is the run
// key. The run (packages/orders `issueDueInvoices`) issues the invoices of placed orders changed in the last days that
// were not compared since, and a new version only when an order was edited. Safe to run twice: an order already
// compared is not taken again, and one order is issued under its own lock.
// This module imports `./keys`, never `./scheduler` (the scheduler imports the catalogue, which imports this).
import { issueDueInvoices } from '@extas/orders';
import type { JobDeps } from './context';
import { runKey, slotOf } from './keys';
import type { Planner } from './worker';

export const INVOICE_ISSUE_JOB = 'invoices.issue';
export const INVOICE_QUEUE = 'documents';

const MINUTE = 60_000;

/** One store's run. */
export function runInvoiceIssue(deps: JobDeps, storeId: number): Promise<{ issued: number; revised: number; unchanged: number }> {
  return issueDueInvoices({ db: deps.db, settings: deps.settings, now: deps.now }, storeId);
}

/** Each live store with issuing on: one run per slot of its `everyMinutes`. */
export const invoicePlanner: Planner = async (deps, now) => {
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const s of stores) {
    const cfg = await deps.settings.value('documents.invoice.issue', { storeId: s.id });
    if (!cfg.enabled) continue;
    const payload = { storeId: s.id };
    out.push({ queue: INVOICE_QUEUE, name: INVOICE_ISSUE_JOB, payload, key: runKey(INVOICE_ISSUE_JOB, payload, slotOf(now.getTime(), cfg.everyMinutes * MINUTE)) });
  }
  return out;
};
