// S06 · PR 559 — the phone-entry risk check. The moment the checkout's phone number is whole (and while the owner keeps
// `checkout.phoneRisk` on), the page asks once in the background, while the customer keeps typing: every connected courier
// fraud check (Steadfast's and Pathao's own, any aggregator — the sources the app passes; PR 567 adds them behind one
// adapter) is asked for the number, each within `budgetMs`. An answer is kept `cacheHours` (CourierFraudCheck); a slow,
// failed or refused one is simply let go, so the customer passes and the form never waits. Nothing is shown to him and
// nothing is decided here: the checkout's own look (PR 560, checkout-risk.ts) and the order's score when it lands (PR
// 156, risk.ts) read the kept answers through `courierFactsOf` for the owner's `pattern` signal — a pattern, not a slip.
//
// Each look-up counts against its IP with phone-first's own limit (PR 555); past it the check asks nobody. A source with a
// fresh answer for the number is not asked again.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { phoneNormalizeBD } from '@extas/delivery';
import { nowOf, parse, setting, type OrdersDeps } from './context';
import { phoneForms } from './phone-history';
import type { CourierFacts } from './risk-score';

/** The SecurityEvent kind of a look-up (the IP only, never the number). */
export const PHONE_RISK_LOOKUP_EVENT = 'checkout.phoneRisk.lookup';

/** One courier fraud check as the app connects it (PR 567's adapter): the number in, its parcels taken and cancelled. */
export interface CourierFraudSource {
  /** The courier's key ('steadfast', 'pathao', an aggregator's). */
  provider: string;
  check(phoneE164: string, signal: AbortSignal): Promise<{ delivered: number; cancelled: number; raw?: Prisma.InputJsonValue }>;
}

export const phoneRiskInput = z.object({ phone: z.string().max(40) }).strict();

export interface PhoneRiskContext {
  storeId: number;
  ip: string | null;
}

/** What the background check did (for the shop's own tests and logs; the customer's page reads nothing from it). */
export interface PhoneRiskRun {
  enabled: boolean;
  /** Sources asked now, answered in time. */
  answered: string[];
  /** Sources with a fresh answer already. */
  fresh: string[];
  /** Sources let go: slow, failed or refused. */
  passed: string[];
}

/** Counts the look-up against its IP; false past phone-first's own limit (then nobody is asked). */
async function withinLimit(deps: OrdersDeps, storeId: number, ip: string | null): Promise<boolean> {
  const [limit, windowSeconds] = await Promise.all([setting(deps, storeId, 'delivery.phoneFirst.rateLimit'), setting(deps, storeId, 'delivery.phoneFirst.rateWindowSeconds')]);
  const now = nowOf(deps);
  const key = ip ?? 'unknown';
  await deps.db.securityEvent.create({ data: { storeId, kind: PHONE_RISK_LOOKUP_EVENT, severity: 'info', details: { ip: key }, createdAt: now } });
  const since = new Date(now.getTime() - windowSeconds * 1000);
  const n = await deps.db.securityEvent.count({ where: { storeId, kind: PHONE_RISK_LOOKUP_EVENT, createdAt: { gt: since }, details: { path: ['ip'], equals: key } } });
  return n <= limit;
}

/** One source within the time budget: its answer, or null when it is slow, fails or answers nonsense. */
async function ask(source: CourierFraudSource, phone: string, budgetMs: number) {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        ac.abort();
        resolve(null);
      }, budgetMs);
    });
    const r = await Promise.race([source.check(phone, ac.signal), late]);
    if (!r) return null;
    const okCount = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0;
    return okCount(r.delivered) && okCount(r.cancelled) ? r : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The background check at phone entry: the courier checks asked in parallel, each answer kept; never throws for a source. */
export async function phoneRiskCheck(deps: OrdersDeps, ctx: PhoneRiskContext, input: unknown, sources: readonly CourierFraudSource[] = []): Promise<PhoneRiskRun> {
  const d = parse(phoneRiskInput, input, 'check');
  const cfg = await setting(deps, ctx.storeId, 'checkout.phoneRisk');
  const run: PhoneRiskRun = { enabled: cfg.enabled, answered: [], fresh: [], passed: [] };
  if (!cfg.enabled) return run;
  const phone = phoneNormalizeBD(d.phone);
  if (!phone.ok || !sources.length) return run;
  if (!(await withinLimit(deps, ctx.storeId, ctx.ip))) {
    run.passed = sources.map((s) => s.provider);
    return run;
  }
  const now = nowOf(deps);
  const kept = await deps.db.courierFraudCheck.findMany({ where: { storeId: ctx.storeId, phone: phone.e164, ok: true, expiresAt: { gt: now } }, select: { provider: true } });
  const have = new Set(kept.map((k) => k.provider));
  await Promise.all(
    sources.map(async (s) => {
      if (have.has(s.provider)) {
        run.fresh.push(s.provider);
        return;
      }
      const r = await ask(s, phone.e164, cfg.budgetMs);
      if (!r) {
        run.passed.push(s.provider);
        return;
      }
      const at = nowOf(deps);
      await deps.db.courierFraudCheck.create({
        data: { storeId: ctx.storeId, phone: phone.e164, provider: s.provider, deliveredCount: r.delivered, cancelledCount: r.cancelled, result: r.raw ?? undefined, ok: true, checkedAt: at, expiresAt: new Date(at.getTime() + cfg.cacheHours * 3_600_000) },
      });
      run.answered.push(s.provider);
    }),
  );
  return run;
}

/** The kept courier answers for a number at a moment (the newest unexpired one of each courier), for the score's pattern. */
export async function courierFactsOf(deps: OrdersDeps, storeId: number, phone: string | null, at: Date): Promise<CourierFacts[]> {
  const forms = phoneForms(phone);
  if (!forms.length) return [];
  const rows = await deps.db.courierFraudCheck.findMany({
    where: { storeId, phone: { in: forms }, ok: true, checkedAt: { lte: at }, expiresAt: { gt: at } },
    orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
    select: { provider: true, deliveredCount: true, cancelledCount: true },
  });
  const by = new Map<string, CourierFacts>();
  for (const r of rows) if (!by.has(r.provider)) by.set(r.provider, { provider: r.provider, delivered: r.deliveredCount ?? 0, cancelled: r.cancelledCount ?? 0 });
  return [...by.values()];
}
