// S13 · PR 267 (register "Cost per order, cost per delivered order, and alert thresholds the owner sets from the
// dashboard"; demo 93-admin-ads.js guardrail card "ডেলিভারি প্রতি খরচ") — Marketing › Ad platforms' cost per order and
// the owner's alert rules.
//
// - The figures are @extas/metrics `adCostPerOrder` over the owner's last `days` days (`ads.costAlerts`, registry v173):
//   spend imported per campaign (PR 265, in taka by the owner's rate, PR 266) ÷ orders placed and ÷ orders delivered,
//   per campaign, per platform and for the shop. Orders reach a platform by the same channel rule as Profit by channel
//   (`reports.channels`).
// - A rule (AdAlertRule; off as it is added) is "cost per order" or "cost per delivered order" over the owner's limit,
//   for the shop, one platform or one platform campaign. Rules are switched off or put away, never deleted (rule 3).
//   The page shows each one against today's figures.
// - With `ads.costAlerts.on`, the daily spend import's hook (ad-spend.ts) sends the crossed rules to the owner's Telegram
//   (the practice copy until the bot's key is in), in his language. Nothing else: an alert never pauses a campaign or
//   changes a budget (rule 6; that is PR 268's, behind a confirm and the owner's approval).
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { adAlertHits, adCostPerOrder, AD_ALERT_METRICS, lastDays, type AdAlertHit, type AdAlertMetric, type AdCost } from '@extas/metrics';
import { adsCostAlertsSchema, storeTarget, type AdsCostAlertsSettings } from '@extas/settings';
import { createConnections, sendOwnerAlert, telegramAdapters } from '@extas/adapters';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, fail, guardAdmin, json, errorResponse, type AdminDeps } from '../admin-auth';
import { t, type Dict } from '../i18n';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { AdPlatformsError, type AdPlatformsDeps, type AdPlatformsWho } from './ad-platforms';
import bn from '../../../messages/admin-ad-platforms.bn.json';
import en from '../../../messages/admin-ad-platforms.en.json';

const S = MOTHER_STORE_ID;
/** The platforms a rule can name (the ones the shop reads spend from). */
export const ALERT_PLATFORMS = ['META', 'GOOGLE', 'TIKTOK'] as const;
const INT_MAX = 2_147_483_647; // hardcode-ok: the largest whole number the database column holds

const scopeSchema = z.union([z.object({ platform: z.enum(ALERT_PLATFORMS) }).strict(), z.object({ adCampaignId: z.string().uuid() }).strict(), z.null()]);
const addSchema = z.object({ action: z.literal('add'), metric: z.enum(AD_ALERT_METRICS), scope: scopeSchema, thresholdMinor: z.number().int().min(1).max(INT_MAX) }).strict();
const setSchema = z.object({ action: z.literal('set'), id: z.string().uuid(), enabled: z.boolean().optional(), thresholdMinor: z.number().int().min(1).max(INT_MAX).optional() }).strict();
const archiveSchema = z.object({ action: z.literal('archive'), id: z.string().uuid() }).strict();

export type AlertScope = z.output<typeof scopeSchema>;

export interface AlertRuleView {
  id: string;
  metric: AdAlertMetric;
  scope: AlertScope;
  /** The campaign's name for a campaign rule (null when it is gone from the shop's list). */
  campaignName: string | null;
  thresholdMinor: number;
  enabled: boolean;
  hit: AdAlertHit;
}

export interface AlertsOverview {
  card: { key: 'alerts'; value: AdsCostAlertsSettings; version: string };
  cost: AdCost;
  rules: AlertRuleView[];
  currency: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const scopeOf = (v: unknown): AlertScope => {
  const ok = scopeSchema.safeParse(v ?? null);
  return ok.success ? ok.data : null;
};

/** The cost figures over the owner's last days (store time). */
export async function alertCost(deps: Pick<AdPlatformsDeps, 'db' | 'resolver' | 'now'>, days?: number): Promise<{ cost: AdCost; currency: string; settings: AdsCostAlertsSettings }> {
  const at = { storeId: S };
  const [settings, tz, currency, rules] = await Promise.all([deps.resolver.value('ads.costAlerts', at), deps.resolver.value('store.timeZone', at), deps.resolver.value('store.currency', at), deps.resolver.value('reports.channels', at)]);
  const w = lastDays(days ?? settings.days, deps.now ? deps.now() : new Date(), tz);
  const cost = await adCostPerOrder(deps.db, S, { from: w.from, to: w.to }, { currency, timeZone: tz, rules });
  return { cost, currency, settings };
}

/** The page's whole card: the settings, the figures and every rule (not put away) against them. */
export async function alertsOverview(deps: Pick<AdPlatformsDeps, 'db' | 'resolver' | 'now'>): Promise<AlertsOverview> {
  const { cost, currency, settings } = await alertCost(deps);
  const rows = await deps.db.adAlertRule.findMany({ where: { storeId: S, archivedAt: null, metric: { in: [...AD_ALERT_METRICS] } }, orderBy: { createdAt: 'asc' } });
  const ids = rows.map((r) => scopeOf(r.scope)).flatMap((s) => (s && 'adCampaignId' in s ? [s.adCampaignId] : []));
  const names = new Map((ids.length ? await deps.db.adCampaign.findMany({ where: { storeId: S, id: { in: ids } }, select: { id: true, name: true } }) : []).map((c) => [c.id, c.name]));
  const inputs = rows.map((r) => ({ id: r.id, metric: r.metric as AdAlertMetric, scope: scopeOf(r.scope), thresholdMinor: r.thresholdMinor ?? 0 }));
  const hits = adAlertHits(inputs, cost);
  return {
    card: { key: 'alerts', value: settings, version: versionOf(settings) },
    cost,
    currency,
    rules: rows.map((r, i) => {
      const scope = inputs[i]!.scope;
      return { id: r.id, metric: inputs[i]!.metric, scope, campaignName: scope && 'adCampaignId' in scope ? (names.get(scope.adCampaignId) ?? null) : null, thresholdMinor: inputs[i]!.thresholdMinor, enabled: r.enabled, hit: hits[i]! };
    }),
  };
}

const issues = (e: z.ZodError) => [...new Set(e.issues.map((i) => String(i.path[0] ?? 'value')))];

/** POST {action: add | set | archive}: a rule added (off), switched, its limit changed, or put away. Audited. */
export async function changeRule(deps: Pick<AdPlatformsDeps, 'db'>, who: AdPlatformsWho, input: unknown): Promise<{ id: string }> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.action === 'add') {
    const ok = addSchema.safeParse(o);
    if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
    const { metric, scope, thresholdMinor } = ok.data;
    if (scope && 'adCampaignId' in scope && !(await deps.db.adCampaign.findFirst({ where: { id: scope.adCampaignId, storeId: S }, select: { id: true } }))) throw new AdPlatformsError('INVALID_INPUT', 400, ['scope']);
    const row = await deps.db.adAlertRule.create({ data: { storeId: S, metric, scope: scope ?? undefined, thresholdMinor, enabled: false } });
    await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adAlert.add', entityType: 'AdAlertRule', entityId: row.id, after: { metric, scope, thresholdMinor } }, who.ctx);
    return { id: row.id };
  }
  const ok = o.action === 'set' ? setSchema.safeParse(o) : o.action === 'archive' ? archiveSchema.safeParse(o) : null;
  if (!ok) throw new AdPlatformsError('INVALID_INPUT', 400, ['action']);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  const before = await deps.db.adAlertRule.findFirst({ where: { id: ok.data.id, storeId: S, archivedAt: null } });
  if (!before) throw new AdPlatformsError('NOT_FOUND', 404);
  const data = ok.data.action === 'archive' ? { archivedAt: new Date(), enabled: false } : { ...(ok.data.enabled === undefined ? {} : { enabled: ok.data.enabled }), ...(ok.data.thresholdMinor === undefined ? {} : { thresholdMinor: ok.data.thresholdMinor }) };
  await deps.db.adAlertRule.update({ where: { id: before.id }, data });
  await audit(deps.db, who.actor, { storeId: S, action: `marketing.adAlert.${ok.data.action}`, entityType: 'AdAlertRule', entityId: before.id, before: { enabled: before.enabled, thresholdMinor: before.thresholdMinor }, after: { enabled: data.enabled ?? before.enabled, thresholdMinor: 'thresholdMinor' in data ? data.thresholdMinor : before.thresholdMinor, archived: ok.data.action === 'archive' } }, who.ctx);
  return { id: before.id };
}

/** PUT {key: 'alerts', value, version}: the owner's alert card (audited when it changes). */
export async function saveAlertsCard(deps: Pick<AdPlatformsDeps, 'db' | 'resolver'>, who: AdPlatformsWho, input: unknown): Promise<AlertsOverview['card']> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'alerts') throw new AdPlatformsError('INVALID_INPUT', 400, ['key']);
  const before = await deps.resolver.value('ads.costAlerts', { storeId: S });
  if (o.version !== versionOf(before)) throw new AdPlatformsError('STALE', 409);
  const ok = adsCostAlertsSchema.safeParse(o.value);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('ads.costAlerts', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Ad platforms' });
    await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adAlert.settings', entityType: 'Setting', entityId: 'ads.costAlerts', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return { key: 'alerts', value: ok.data, version: versionOf(ok.data) };
}

/** The words of one Telegram alert (null with nothing crossed). Exported for its tests. */
export function alertText(o: AlertsOverview, lang: 'bn' | 'en'): string | null {
  const d = (lang === 'bn' ? bn : en) as unknown as Dict;
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `adp.alerts.${k}`, vars);
  const m = moneyOf(o.currency, lang === 'bn' ? 'bn-BD' : 'en-GB');
  const lines = o.rules
    .filter((r) => r.enabled && (r.hit.state === 'over' || r.hit.state === 'noOrders'))
    .map((r) => {
      const where = r.scope && 'platform' in r.scope ? t(d, `adp.platform.${r.scope.platform.toLowerCase()}`) : r.scope ? (r.campaignName ?? s('gone')) : s('scopeShop');
      const vars = { where, metric: s(`metric.${r.metric}`), value: r.hit.valueMinor === null ? '' : formatMoney(r.hit.valueMinor, m), limit: formatMoney(r.thresholdMinor, m), spend: formatMoney(r.hit.spendMinor ?? 0, m) };
      return `• ${s(r.hit.state === 'over' ? 'tg.over' : 'tg.noOrders', vars)}`;
    });
  return lines.length ? [s('tg.head', { from: o.cost.from, to: o.cost.to }), ...lines, s('tg.foot')].join('\n') : null;
}

/** After the daily spend import (switch on): the crossed rules go to the owner's Telegram. Never throws. */
export async function sendCostAlerts(deps: Pick<AdPlatformsDeps, 'db' | 'resolver' | 'vault' | 'now'> & { send?: (text: string) => Promise<void> }): Promise<{ crossed: number; sent: boolean }> {
  try {
    const o = await alertsOverview(deps);
    if (!o.card.value.on) return { crossed: 0, sent: false };
    const text = alertText(o, o.card.value.lang);
    const crossed = text ? text.split('\n').length - 2 : 0; // hardcode-ok: the head and foot lines
    if (!text) return { crossed, sent: false };
    await (deps.send ?? ((x: string) => telegram(deps, x)))(text);
    return { crossed, sent: true };
  } catch (e) {
    console.warn(`ad cost alerts: not sent (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return { crossed: 0, sent: false };
  }
}

/** The owner's Telegram bot on Keys & connections, the practice copy until it is connected. */
async function telegram(deps: Pick<AdPlatformsDeps, 'db' | 'resolver' | 'vault'>, text: string): Promise<void> {
  const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: telegramAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
  await sendOwnerAlert(c, text);
}

const answer = (e: unknown): Response => (e instanceof AdPlatformsError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/**
 * /api/admin/marketing/ad-platforms/alerts — GET the figures, the card and the rules (`marketing.campaigns.read`);
 * POST {action: add | set | archive} a rule, PUT {key: 'alerts', value, version} the card (`marketing.campaigns.write`).
 */
export async function adAlertsHandler(request: Request, deps: AdminDeps | null, extra: Partial<AdPlatformsDeps> = {}): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.campaigns.read' : 'marketing.campaigns.write', storeId: S });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, vault: deps!.vault, ...extra };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') return json({ ok: true, ...(await alertsOverview(d)) });
    if (method === 'PUT') return json({ ok: true, cards: { alerts: await saveAlertsCard(d, who, await body(request)) } });
    return json({ ok: true, ...(await changeRule(d, who, await body(request))) });
  } catch (e) {
    return answer(e);
  }
}
