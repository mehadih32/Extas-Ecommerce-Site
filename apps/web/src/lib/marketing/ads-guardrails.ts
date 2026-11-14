// S15 · PR 581 (register "তীরন্দাজ Tirondaj — the seventh agent, ads specialist … Guardrails enforced by code, not
// by the AI: target sales, max cost per purchase, daily/monthly budget ceilings, auto-decrease allowed, any budget
// increase only after the owner's approval, kill switch, every change logged"; Blueprint C10.1, C10.2) — Marketing
// › Ad platforms › Ads guardrails.
//
// - Reads: delivered sales, delivered purchases and spend over the trailing 30 days (@extas/metrics
//   `adDeliveredReturn`, the same "delivered, not placed" figure PR 269's growth agent already reads) — the sum of
//   every active campaign's own daily budget (the daily ceiling's own figure) and, per campaign, its own
//   cost-per-purchase (spend ÷ delivered) against the owner's cap.
// - Enforces: `ads.guardrails`'s ceilings and cap are checked inside `campaign-control.ts`'s `apply`/`applyCreate`
//   — the one choke point every increase this shop ever sends goes through, even one the owner has already
//   approved (CLAUDE.md "guardrails enforced by code, not by the AI"). This module never duplicates that check; it
//   only reads the same figures to show them, and calls the same public `requestCampaignChange` the admin page
//   itself uses for every other pause.
// - The kill switch is always live (independent of `ads.guardrails.on`): turning it on, in the same save, pauses
//   every active campaign that has no change already waiting, through `requestCampaignChange` with the system actor
//   — audited the same way a person's own pause is (`marketing.adControl.request`/`.apply`), plus one more entry
//   naming the kill switch itself.
// - "Decrease now" (POST `{action:'decreaseNow'}`, needs `autoDecreaseAllowed` on and `marketing.ads.control`):
//   every campaign over the cap gets its daily budget lowered by `decreaseStepPercent`, sent at once — a decrease
//   never needs the owner's approval, the same rule `campaign-control.ts` already applies to every budget change.
import { createHash } from 'node:crypto';
import { adDeliveredReturn, lastDays, type AdReturnRow } from '@extas/metrics';
import { adsGuardrailsSchema, storeTarget, type AdsGuardrailsSettings } from '@extas/settings';
import { audit, SYSTEM } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { moneyOf } from '@/components/admin/products/model';
import { AdPlatformsError, type AdPlatformsDeps, type AdPlatformsWho } from './ad-platforms';
import { cpaMinorOf, ceilingBreach, GUARDRAIL_WINDOW_DAYS, isPaused, requestCampaignChange, type ControlDeps } from './campaign-control';

const S = MOTHER_STORE_ID;
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const issues = (e: { issues: { path: PropertyKey[] }[] }) => [...new Set(e.issues.map((i) => String(i.path[0] ?? 'value')))];

export type GuardrailDeps = ControlDeps;

export interface GuardrailCampaignRow extends AdReturnRow {
  name: string;
  dailyBudgetMinor: number | null;
  paused: boolean;
  cpaMinor: number | null;
  overCap: boolean;
}

export interface GuardrailOverview {
  card: { key: 'guardrails'; value: AdsGuardrailsSettings; version: string };
  currency: string;
  from: string;
  to: string;
  /** Sum of every active campaign's own daily budget — the daily ceiling's own figure. */
  activeDailyBudgetMinor: number;
  /** The shop's ad spend over the trailing days — the monthly ceiling's own figure. */
  spendMinor: number | null;
  deliveredSalesMinor: number;
  delivered: number;
  campaigns: GuardrailCampaignRow[];
}

/** The figures the page and the enforcement both read: the trailing window's delivered return, and every active
 * campaign's own daily budget and pause state. */
export async function guardrailFigures(deps: Pick<GuardrailDeps, 'db' | 'resolver' | 'now'>): Promise<GuardrailOverview> {
  const at = { storeId: S };
  const [settings, tz, currency] = await Promise.all([deps.resolver.value('ads.guardrails', at), deps.resolver.value('store.timeZone', at), deps.resolver.value('store.currency', at)]);
  const now = deps.now ? deps.now() : new Date();
  const w = lastDays(GUARDRAIL_WINDOW_DAYS, now, tz);
  const ret = await adDeliveredReturn(deps.db, S, w, { currency, timeZone: tz });
  const ids = ret.campaigns.map((r) => r.key);
  const rows = ids.length ? await deps.db.adCampaign.findMany({ where: { storeId: S, id: { in: ids } }, select: { id: true, name: true, status: true, dailyBudgetMinor: true, archivedAt: true } }) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const active = rows.filter((r) => !r.archivedAt && !isPaused(r.status));
  // the owner's own ceilings and cap are typed as whole store currency (PR 269's own `noDeliveredSpend` precedent)
  const scale = 10 ** moneyOf(currency, 'en-GB').digits;
  return {
    card: { key: 'guardrails', value: settings, version: versionOf(settings) },
    currency,
    from: ret.from,
    to: ret.to,
    activeDailyBudgetMinor: active.reduce((sum, r) => sum + (r.dailyBudgetMinor ?? 0), 0),
    spendMinor: ret.total.spendMinor,
    deliveredSalesMinor: ret.total.deliveredSalesMinor,
    delivered: ret.total.delivered,
    campaigns: ret.campaigns.map((r) => {
      const c = byId.get(r.key);
      const cpaMinor = cpaMinorOf(r.spendMinor, r.delivered);
      return { ...r, name: c?.name ?? r.key, dailyBudgetMinor: c?.dailyBudgetMinor ?? null, paused: c ? isPaused(c.status) : false, cpaMinor, overCap: ceilingBreach(cpaMinor, settings.maxCostPerPurchase * scale) };
    }),
  };
}

/** Every active campaign with no change already waiting, paused with the system actor — the kill switch's own mass
 * pause. A pause is never an increase, so it is never itself refused by the guardrails it is turning on. */
async function pauseEveryActiveCampaign(deps: GuardrailDeps, reason: string): Promise<number> {
  const who: AdPlatformsWho = { actor: SYSTEM, ctx: { source: 'ads-guardrails' } };
  const rows = await deps.db.adCampaign.findMany({ where: { storeId: S, archivedAt: null, status: 'ACTIVE' }, select: { id: true } });
  let paused = 0;
  for (const r of rows) {
    try {
      const result = await requestCampaignChange(deps, who, { action: 'change', adCampaignId: r.id, change: 'pause', confirm: true });
      if (result.status === 'APPLIED' || result.status === 'PRACTICE') paused += 1;
    } catch {
      // another change already waits for this campaign, or it moved on since the read above — left for the owner
    }
  }
  await audit(deps.db, SYSTEM, { storeId: S, action: 'marketing.guardrails.killSwitch', entityType: 'Setting', entityId: 'ads.guardrails', after: { paused, of: rows.length, reason } }, who.ctx);
  return paused;
}

/** PUT {key: 'guardrails', value, version}: the owner's own ceilings, cap, targets and switches. Turning the kill
 * switch on pauses every active campaign in the same call; turning it off does not resume anything by itself. */
export async function saveGuardrailsCard(deps: GuardrailDeps, who: AdPlatformsWho, input: unknown): Promise<GuardrailOverview['card']> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'guardrails') throw new AdPlatformsError('INVALID_INPUT', 400, ['key']);
  const before = await deps.resolver.value('ads.guardrails', { storeId: S });
  if (o.version !== versionOf(before)) throw new AdPlatformsError('STALE', 409);
  const ok = adsGuardrailsSchema.safeParse(o.value);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('ads.guardrails', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Ad platforms › Ads guardrails' });
    await audit(deps.db, who.actor, { storeId: S, action: 'marketing.guardrails.settings', entityType: 'Setting', entityId: 'ads.guardrails', before: { ...before }, after: { ...ok.data } }, who.ctx);
    if (ok.data.killSwitch && !before.killSwitch) await pauseEveryActiveCampaign(deps, 'kill switch turned on');
  }
  return { key: 'guardrails', value: ok.data, version: versionOf(ok.data) };
}

/** POST {action: 'decreaseNow'}: every campaign over the cap, with auto-decrease allowed, is lowered by the owner's
 * step — sent at once, never waiting for approval (a decrease never does). Needs `marketing.ads.control`. */
export async function decreaseNow(deps: GuardrailDeps, who: AdPlatformsWho): Promise<{ lowered: number; skipped: number }> {
  const settings = await deps.resolver.value('ads.guardrails', { storeId: S });
  if (!settings.autoDecreaseAllowed || settings.maxCostPerPurchase <= 0) throw new AdPlatformsError('OFF', 409);
  const f = await guardrailFigures(deps);
  let lowered = 0;
  let skipped = 0;
  for (const c of f.campaigns) {
    if (!c.overCap || c.paused || c.dailyBudgetMinor === null) continue;
    const next = Math.max(1, Math.round((c.dailyBudgetMinor * (100 - settings.decreaseStepPercent)) / 100)); // hardcode-ok: the setting's own percent arithmetic
    try {
      await requestCampaignChange(deps, who, { action: 'change', adCampaignId: c.key, change: 'budget', dailyBudgetMinor: next, confirm: true });
      lowered += 1;
    } catch {
      skipped += 1;
    }
  }
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.guardrails.decreaseNow', entityType: 'Setting', entityId: 'ads.guardrails', after: { lowered, skipped } }, who.ctx);
  return { lowered, skipped };
}

const answer = (e: unknown): Response => (e instanceof AdPlatformsError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/**
 * /api/admin/marketing/ad-platforms/guardrails — GET the figures and the card (`marketing.campaigns.read`); PUT the
 * card (`marketing.ads.approve`: only the owner sets the ceilings, the cap and the kill switch); POST
 * {action: 'decreaseNow'} (`marketing.ads.control`).
 */
export async function guardrailsHandler(request: Request, deps: AdminDeps | null, extra: Partial<GuardrailDeps> = {}): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const permission = method === 'GET' ? 'marketing.campaigns.read' : method === 'PUT' ? 'marketing.ads.approve' : 'marketing.ads.control';
  const g = await guardAdmin(request, deps, { permission, storeId: S });
  if (g instanceof Response) return g;
  const d: GuardrailDeps = { db: deps!.db, resolver: deps!.resolver, vault: deps!.vault, ...(extra as Partial<AdPlatformsDeps>) };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') return json({ ok: true, ...(await guardrailFigures(d)) });
    if (method === 'PUT') return json({ ok: true, cards: { guardrails: await saveGuardrailsCard(d, who, await body(request)) } });
    return json({ ok: true, ...(await decreaseNow(d, who)) });
  } catch (e) {
    return answer(e);
  }
}
