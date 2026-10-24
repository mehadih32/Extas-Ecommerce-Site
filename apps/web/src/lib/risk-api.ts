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
// A switch only decides whether a rule marks and proposes: nothing here blocks anyone, decides an order, moves money or
// changes COD, a price or a charge. The screen is Orders → Risk rules (ORD-06, /admin/orders/risk-rules).
import * as od from '@extas/orders';
import { body, fail, type AdminDeps } from './admin-auth';
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
  if (path[0] !== 'rules' || path.length > 1) return notFound();
  if (m === 'GET') return handle(request, deps, 'risk.rules.read', async (x) => ({ ...(await od.riskRules(x.deps, x.who)) }));
  if (m === 'PUT') return handle(request, deps, 'risk.rules.write', async (x) => ({ ...(await od.switchRules({ ...x.deps, settings: deps!.resolver }, x.who, await body(request))) }));
  return notAllowed();
}
