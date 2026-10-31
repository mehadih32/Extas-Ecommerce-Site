// S21 · PR 415 (CN-015) — customer problems the shop's own server finds, with no page needed to report them: a money
// route (the bag, placing an order, a payment gateway's callback) that answers 5xx or breaks is recorded as a
// `server_error` problem on its journey step, through the same record-keeping as the pages' reports
// (lib/problems/ingest.ts `keepRecord`), so it is judged (Urgent on the bag and checkout) and may alert the owner.
// Only while the recorder (`health.problems`) is on. Nothing personal is kept: the detail is the method, the route's
// pattern and the status (never the error's message or the address the visitor typed); the visitor is a one-way hash
// of the anonymous device cookie, or a fresh id without one; the device and browser families come from the user
// agent. Watching never changes an answer, never slows a good one, and never hides an error (it is thrown on).
import { createHash, randomUUID } from 'node:crypto';
import { adminDeps, readCookie } from '../admin-auth';
import { DEVICE_COOKIE } from '../shop/account';
import { shopStoreId } from '../shop/store-id';
import { keepRecord, type ProblemDeps } from './ingest';
import { browserOf, deviceOf, DETAIL_MAX, type JourneyStep } from './kinds';

/** What a watched route did: its 5xx status, or `threw` when the handler broke. */
export type ServerOutcome = `${number}` | 'threw';

/** The visitor of a server problem: a hash of the anonymous device cookie (never the cookie), or a fresh id. */
export function serverVisitor(request: Request): string {
  const device = readCookie(request, DEVICE_COOKIE);
  const id = device ? createHash('sha256').update(device).digest('hex') : randomUUID().replaceAll('-', '');
  return `srv-${id.slice(0, 32)}`; // hardcode-ok: the id's length, within the visitor id's 8–64 characters
}

/** Records one server problem; never throws (a record must not change what the customer gets). */
export async function recordServerProblem(deps: ProblemDeps | null, request: Request, step: JourneyStep, route: string, outcome: ServerOutcome): Promise<void> {
  if (!deps) return;
  try {
    const storeId = shopStoreId();
    const cfg = await deps.resolver.value('health.problems', { storeId });
    if (!cfg.enabled) return;
    const ua = request.headers.get('user-agent') ?? '';
    await keepRecord(deps, cfg, {
      storeId,
      kind: 'server_error',
      step,
      path: route,
      detail: `${request.method.toUpperCase()} ${route} ${outcome}`.slice(0, DETAIL_MAX),
      visitorId: serverVisitor(request),
      device: deviceOf(ua),
      browser: browserOf(ua),
      network: null,
      ms: null,
      now: deps.now?.() ?? new Date(),
    });
  } catch (e) {
    console.warn(`problems: a server problem was not kept (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
  }
}

/**
 * A route handler that records its own failures: an answer of 500 or more, or a throw (recorded, then thrown on).
 * `route` is the route's pattern as it is shown (e.g. `/api/payments/callback/[provider]`).
 */
export function watchShop<A extends unknown[]>(
  step: JourneyStep,
  route: string,
  handler: (request: Request, ...rest: A) => Response | Promise<Response>,
  deps: () => ProblemDeps | null = adminDeps,
): (request: Request, ...rest: A) => Promise<Response> {
  const depsOrNull = (): ProblemDeps | null => {
    try {
      return deps();
    } catch {
      return null;
    }
  };
  return async (request: Request, ...rest: A) => {
    let res: Response;
    try {
      res = await handler(request, ...rest);
    } catch (e) {
      await recordServerProblem(depsOrNull(), request, step, route, 'threw');
      throw e;
    }
    if (res.status >= 500) await recordServerProblem(depsOrNull(), request, step, route, `${res.status}`);
    return res;
  };
}
