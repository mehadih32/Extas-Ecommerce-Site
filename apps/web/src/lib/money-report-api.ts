// S16 · PR 351 (B3.10, §59 answer 24) — the money report to the owner on Money → Profit & loss: what the card shows (the
// setting with its version, the next day it goes, and the words it would send for its period now — the same words the
// worker sends, @extas/inventory money-report.ts) and the one write:
//   PUT /api/admin/money/profit/report   {value: {enabled, frequency, at, weekday, monthDay, lang}, version}
//        (`books.report`; settings history + audit `money.report`; a stale version is refused)
// Nothing here sends anything or moves money; the worker sends the report at its time (packages/jobs money-report.ts).
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { moneyReportNextDay, moneyReportPreview, moneyReportText, profitReport } from '@extas/inventory';
import { registry, SettingsError, storeTarget, type MoneyReportSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import type { AppResolver } from './settings';

export interface MoneyReportView {
  value: MoneyReportSettings;
  version: number;
  /** The store day the next report goes, or null while off. */
  nextDay: string | null;
  /** The words it would send for its period if it went now. */
  preview: string;
}

/** The card's view for one store at `now`. */
export async function moneyReportView(deps: { db: PrismaClient; resolver: AppResolver }, storeId: number, now = new Date()): Promise<MoneyReportView> {
  const at = { storeId };
  const [s, tz, currency] = await Promise.all([deps.resolver.get('money.report', at), deps.resolver.value('store.timeZone', at), deps.resolver.value('store.currency', at)]);
  const period = moneyReportPreview(now, tz, s.value);
  const report = await profitReport({ db: deps.db, settings: deps.resolver }, storeId, period.from, period.to);
  return { value: s.value, version: s.version, nextDay: moneyReportNextDay(now, tz, s.value), preview: moneyReportText(report, period, s.value.lang, currency) };
}

/** PUT the setting (the table above). */
export async function moneyReportRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'PUT') return fail(405, 'method-not-allowed');
  const raw = new URL(request.url).searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : Number(raw);
  if (!Number.isInteger(storeId) || storeId < 1) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'books.report', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    const b = await body(request);
    const parsed = registry['money.report'].schema.safeParse(b.value === undefined ? Symbol('missing') : b.value);
    if (!parsed.success) return json({ ok: false, error: 'INVALID_INPUT', details: parsed.error.issues.map((i) => `${['money.report', ...i.path].join('.')}: ${i.message}`) }, { status: 400 });
    const at = { storeId };
    const before = await d.resolver.value('money.report', at);
    if (JSON.stringify(before) !== JSON.stringify(parsed.data)) {
      await d.resolver.set('money.report', parsed.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Money › Profit & loss', expectedVersion: typeof b.version === 'number' ? b.version : undefined });
      await audit(d.db, g.actor, { storeId, action: 'money.report', entityType: 'Setting', entityId: 'money.report', before: { 'money.report': before }, after: { 'money.report': parsed.data } }, g.ctx);
    }
    const now = await d.resolver.get('money.report', at);
    return json({ ok: true, value: now.value, version: now.version });
  } catch (e) {
    if (e instanceof SettingsError) return json({ ok: false, error: e.code === 'VERSION_CONFLICT' ? 'VERSION_CONFLICT' : 'INVALID_INPUT', details: [...e.issues] }, { status: e.code === 'VERSION_CONFLICT' ? 409 : 400 });
    return errorResponse(e);
  }
}
