// S06 · PR 544 — the risk rules admin API (ORD-06 "Rule switches"; BACKEND-ARCHITECTURE §8.7). `path` is what comes after
// /api/admin/risk:
//   GET   /api/admin/risk/rules     every fraud and duplicate rule with its switch: key, group, the switch above it,
//                                   words (en, bn), the setting that holds it, on, active (on and everything above on),
//                                   what it ships with, and the list's version (risk.rules.read)
//   PUT   /api/admin/risk/rules     {switches: {<rule key>: true | false, …}, version?} switches one or more rules at
//                                   once, all-or-nothing; a stale version is 409 STALE; returns the new list
//                                   (risk.rules.write)
//   GET   /api/admin/risk/levels    PR 161: what happens at each risk band — watch, hold, a call, the advance proposed —
//                                   with the bands, the owner's hold reasons, Claude's suggested set and the version
//                                   (risk.rules.read)
//   PUT   /api/admin/risk/levels    {value, version?} saves the levels whole; a stale version is 409 STALE (risk.rules.write)
//   GET   /api/admin/risk/advance   PR 542: the advance request card — auto (off as it ships), the ways ticked first, the
//                                   payment service of the pay link, whether the levels are on, the version (risk.rules.read)
//   PUT   /api/admin/risk/advance   {value, version?} saves it whole; a stale version is 409 STALE (risk.rules.write)
//   GET   /api/admin/risk/blocklist PR 162: the listed numbers (reason, who, when), the newest undone ones, the switch
//                                   (risk.rules.read)
//   POST  /api/admin/risk/blocklist {phone | orderId, reason} lists a number (risk.block); listed already is 409
//                                   ALREADY_LISTED
//   PUT   /api/admin/risk/blocklist {value} the switch, what a match gets, the hold reason (risk.rules.write)
//   POST  /api/admin/risk/blocklist/<id>/unblock {reason} undoes a listing, the row kept (risk.unblock)
//   POST  /api/admin/risk/blocklist/proposals/<id> PR 523: {decision: block | dismiss, reason} a person decides a number
//                                   proposed for the list (risk.block); decided already is 409 NOTHING_CHANGED
//   GET   /api/admin/risk/block-proposal PR 523: the proposal's card (risk.rules.read); PUT {key, value, version} saves
//                                   it (risk.rules.write) — lib/admin-orders/block-proposal-api.ts
//   GET   /api/admin/risk/refusers  PR 163: the repeat refusers (from the owner's number of refusals), their terms, the
//                                   ended ones, the switch (risk.rules.read)
//   PUT   /api/admin/risk/refusers  {value} the switch and the number of refusals (risk.rules.write)
//   POST  /api/admin/risk/refusers/terms {phone, terms, reason} the owner's terms for a number (risk.refuser.terms)
//   POST  /api/admin/risk/refusers/terms/<id>/end {reason} ends them, the row kept (risk.refuser.terms)
//   GET   /api/admin/risk/report    PR 164: the fraud report and the RTO cost book (?from, ?to) with its settings card
//                                   (risk.report); PUT {key: 'report', value, version} its days and size (settings.write)
//                                   — lib/admin-reports/fraud-api.ts
//   GET   /api/admin/risk/bundling  PR 522: one parcel for one person's orders, the card (risk.rules.read); PUT {key, value,
//                                   version} saves it (risk.rules.write); POST /api/admin/risk/bundle {orderId, note?} is
//                                   "One parcel" on an order (orders.merge) — lib/admin-orders/bundling-api.ts
//   GET   /api/admin/risk/good-customer PR 524: the good-customer override's card (risk.rules.read); PUT {key, value,
//                                   version} saves it (risk.rules.write) — lib/admin-orders/good-customer-api.ts
//   GET   /api/admin/risk/stopped   PR 524: the stop report with its card (risk.report); PUT {key: 'stopReport', value,
//                                   version} its days, warning share, fewest stops and size (settings.write)
//                                   — lib/admin-reports/stop-report-api.ts
//   GET   /api/admin/risk/digest    PR 540: the approval digest (?from, ?to) with the gate's card (orders.read); PUT
//                                   {key: 'approval', value, version} the gate and the list size (risk.rules.write);
//                                   POST /api/admin/risk/hold-proposals/<orderId> {decision, note} a person decides a
//                                   proposed hold (orders.hold) — lib/admin-orders/digest-api.ts
//   GET   /api/admin/risk/learning  PR 543: the decision learning report with its card (risk.report); PUT {key:
//                                   'learning', value, version} its switch, days and limits (settings.write)
//                                   — lib/admin-reports/learning-api.ts
//   GET   /api/admin/risk/calls     PR 545: the new-customer card and the call outcomes card (orders.read); PUT {key:
//                                   'newCustomer' | 'outcomes', value, version} (risk.rules.write) — lib/admin-orders/calls-api.ts
// A switch only decides whether a rule marks and proposes (the blocklist: marks or holds for a person): nothing here cancels, decides an order, moves money or
// changes COD, a price or a charge. The screen is Orders → Risk rules (ORD-06, /admin/orders/risk-rules).
import * as od from '@extas/orders';
import { body, fail, type AdminDeps } from './admin-auth';
import { fraudReportRoute } from './admin-reports/fraud-api';
import { stopReportRoute } from './admin-reports/stop-report-api';
import { learningRoute } from './admin-reports/learning-api';
import { callsRoute } from './admin-orders/calls-api';
import { blockProposalSettingsRoute } from './admin-orders/block-proposal-api';
import { bundleRoute, bundlingSettingsRoute } from './admin-orders/bundling-api';
import { goodCustomerSettingsRoute } from './admin-orders/good-customer-api';
import { digestRoute, holdProposalRoute } from './admin-orders/digest-api';
import { handle } from './orders-api';

const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const notFound = () => Promise.resolve(fail(404, 'not-found'));

/** Every risk admin route. */
export async function riskRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  if (path[0] === 'levels' && path.length === 1) {
    if (m === 'GET') return handle(request, deps, 'risk.rules.read', async (x) => ({ ...(await od.riskLevels(x.deps, x.who)) }));
    if (m === 'PUT') return handle(request, deps, 'risk.rules.write', async (x) => ({ ...(await od.saveRiskLevels({ ...x.deps, settings: deps!.resolver }, x.who, await body(request))) }));
    return notAllowed();
  }
  if (path[0] === 'advance' && path.length === 1) {
    if (m === 'GET') return handle(request, deps, 'risk.rules.read', async (x) => ({ ...(await od.advanceSettings(x.deps, x.who)) }));
    if (m === 'PUT') return handle(request, deps, 'risk.rules.write', async (x) => ({ ...(await od.saveAdvanceSettings({ ...x.deps, settings: deps!.resolver }, x.who, await body(request))) }));
    return notAllowed();
  }
  if (path[0] === 'blocklist') {
    if (path.length === 1) {
      if (m === 'GET') return handle(request, deps, 'risk.rules.read', async (x) => ({ ...(await od.blocklist(x.deps, x.who)) }));
      if (m === 'POST') return handle(request, deps, 'risk.block', async (x) => ({ ...(await od.blockNumber(x.deps, x.who, await body(request))) }));
      if (m === 'PUT') return handle(request, deps, 'risk.rules.write', async (x) => ({ ...(await od.saveBlocklist({ ...x.deps, settings: deps!.resolver }, x.who, await body(request))) }));
      return notAllowed();
    }
    if (path.length === 3 && path[1] === 'proposals') {
      if (m === 'POST') return handle(request, deps, 'risk.block', async (x) => ({ ...(await od.decideBlockProposal(x.deps, x.who, path[2]!, await body(request))) }));
      return notAllowed();
    }
    if (path.length === 3 && path[2] === 'unblock') {
      if (m === 'POST') return handle(request, deps, 'risk.unblock', async (x) => ({ ...(await od.unblockNumber(x.deps, x.who, path[1]!, await body(request))) }));
      return notAllowed();
    }
    return notFound();
  }
  if (path[0] === 'refusers') {
    if (path.length === 1) {
      if (m === 'GET') return handle(request, deps, 'risk.rules.read', async (x) => ({ ...(await od.refusers(x.deps, x.who)) }));
      if (m === 'PUT') return handle(request, deps, 'risk.rules.write', async (x) => ({ ...(await od.saveRefusers({ ...x.deps, settings: deps!.resolver }, x.who, await body(request))) }));
      return notAllowed();
    }
    if (path.length === 2 && path[1] === 'terms') {
      if (m === 'POST') return handle(request, deps, 'risk.refuser.terms', async (x) => ({ ...(await od.setRefuserTerms(x.deps, x.who, await body(request))) }));
      return notAllowed();
    }
    if (path.length === 4 && path[1] === 'terms' && path[3] === 'end') {
      if (m === 'POST') return handle(request, deps, 'risk.refuser.terms', async (x) => ({ ...(await od.endRefuserTerms(x.deps, x.who, path[2]!, await body(request))) }));
      return notAllowed();
    }
    return notFound();
  }
  if (path[0] === 'report') return fraudReportRoute(request, deps, path);
  if (path[0] === 'bundling') return bundlingSettingsRoute(request, deps, path);
  if (path[0] === 'block-proposal') return blockProposalSettingsRoute(request, deps, path);
  if (path[0] === 'bundle') return bundleRoute(request, deps, path);
  if (path[0] === 'good-customer') return goodCustomerSettingsRoute(request, deps, path);
  if (path[0] === 'stopped') return stopReportRoute(request, deps, path);
  if (path[0] === 'digest') return digestRoute(request, deps, path);
  if (path[0] === 'hold-proposals') return holdProposalRoute(request, deps, path);
  if (path[0] === 'learning') return learningRoute(request, deps, path);
  if (path[0] === 'calls') return callsRoute(request, deps, path);
  if (path[0] !== 'rules' || path.length > 1) return notFound();
  if (m === 'GET') return handle(request, deps, 'risk.rules.read', async (x) => ({ ...(await od.riskRules(x.deps, x.who)) }));
  if (m === 'PUT') return handle(request, deps, 'risk.rules.write', async (x) => ({ ...(await od.switchRules({ ...x.deps, settings: deps!.resolver }, x.who, await body(request))) }));
  return notAllowed();
}
