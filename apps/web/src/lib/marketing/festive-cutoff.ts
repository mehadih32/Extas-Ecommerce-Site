// S13 · PR 281 — Marketing › Festive cut-off (/admin/marketing/festive): the switch and where the live festive Smart
// Rules' words show on the shop (`marketing.festiveCutoff`, registry v216, off as shipped), the home section's heading
// and link, and what each live festive rule says now — each delivery band's last order time on the store's clock,
// whether it passed, and the words the shop shows (the short words before, the "after" words once passed). The rules,
// their dates and their words are made and changed in Smart Rules (PR 214's template "Festival delivery cut-off");
// this page never writes a rule, a date, a price or a promise. Seeing needs `marketing.campaigns.read`; the settings
// card `marketing.campaigns.write`, audited.
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import * as rl from '@extas/rules';
import { festiveCutoffSettingsSchema, storeTarget, type FestiveCutoffSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import type { AdPlatformsWho } from './ad-platforms';

const S = MOTHER_STORE_ID;

export class FestiveCutoffError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface FestiveCutoffDeps {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
  now?: () => Date;
}

/** One live festive rule as the page shows it. */
export interface FestiveRuleRow {
  key: string;
  name: { en: string; bn: string | null };
  /** The shop places among the rule's own placements: home (announcement), product, checkout. */
  places: ('home' | 'product' | 'checkout')[];
  /** Earliest first, then by band. */
  cuts: { band: string; bandName: { en: string; bn: string | null } | null; at: string; passed: boolean }[];
  /** What the home and product pages say now (no band known), in each language; null: nothing (no words written). */
  now: { en: string | null; bn: string | null };
  state: 'open' | 'closed' | 'none';
}

export interface FestiveCutoffOverview {
  settings: FestiveCutoffSettings;
  card: { key: 'festiveCutoff'; value: FestiveCutoffSettings; version: string };
  timeZone: string;
  rules: FestiveRuleRow[];
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const settingsOf = (deps: FestiveCutoffDeps) => deps.resolver.value('marketing.festiveCutoff', { storeId: S });
const PLACE_OF: Record<string, FestiveRuleRow['places'][number]> = { announcement: 'home', product: 'product', checkout: 'checkout' };

/** GET: the settings, the store's clock and each live festive rule with its band times and its words now. */
export async function festiveCutoffOverview(deps: FestiveCutoffDeps): Promise<FestiveCutoffOverview> {
  const now = deps.now?.() ?? new Date();
  const rdeps: rl.RulesDeps = { db: deps.db, settings: deps.resolver, now: () => now };
  const [settings, rules, bands, ctx] = await Promise.all([
    settingsOf(deps),
    rl.cachedActiveRules(rdeps, S),
    deps.db.deliveryBand.findMany({ where: { storeId: S }, select: { key: true, nameEn: true, nameBn: true } }),
    rl.textContext(rdeps, S),
  ]);
  const bandName = new Map(bands.map((b) => [b.key, { en: b.nameEn, bn: b.nameBn ?? null }]));
  const others = rl.othersByKey(rules);
  const live = rules.filter((r) => r.kind === 'festive' && rl.isLive(r, now) && rl.festiveCuts(r).length);
  const words = (r: rl.Rule, locale: string): string | null => {
    const placement = r.placements.find((p) => PLACE_OF[p]) ?? r.placements[0] ?? 'announcement';
    return rl.festiveLinesOf([r], { placement, band: null, now }, { ...ctx, locale }, others)[0]?.text ?? null;
  };
  const rows: FestiveRuleRow[] = live.sort(rl.resolutionOrder).map((r) => ({
    key: r.key,
    name: { en: r.nameEn, bn: r.nameBn?.trim() || null },
    places: [...new Set(r.placements.flatMap((p) => PLACE_OF[p] ?? []))],
    cuts: rl
      .festiveCuts(r)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.band.localeCompare(b.band))
      .map((c) => ({ band: c.band, bandName: bandName.get(c.band) ?? null, at: c.at, passed: new Date(c.at) <= now })),
    now: { en: words(r, 'en-BD'), bn: words(r, 'bn-BD') },
    state: rl.festiveState(rl.festiveCuts(r), null, now).state,
  }));
  return { settings, card: { key: 'festiveCutoff', value: settings, version: versionOf(settings) }, timeZone: ctx.timeZone, rules: rows };
}

/** The card as the form sends it: an empty link is no link. */
function cleaned(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v;
  const o = { ...(v as Record<string, unknown>) };
  if (typeof o.linkHref === 'string') o.linkHref = o.linkHref.trim() || null;
  return o;
}

/** PUT: the settings card ({key: 'festiveCutoff', value, version}). Audited. */
export async function saveFestiveCutoffCard(deps: FestiveCutoffDeps, who: AdPlatformsWho, input: unknown): Promise<FestiveCutoffOverview['card']> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'festiveCutoff') throw new FestiveCutoffError('INVALID_INPUT', 400, ['key']);
  const before = await settingsOf(deps);
  if (o.version !== versionOf(before)) throw new FestiveCutoffError('STALE', 409);
  const ok = festiveCutoffSettingsSchema.safeParse(cleaned(o.value));
  if (!ok.success) throw new FestiveCutoffError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('marketing.festiveCutoff', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Festive cut-off' });
    await audit(deps.db, who.actor, { storeId: S, action: 'festiveCutoff.settings', entityType: 'Setting', entityId: 'marketing.festiveCutoff', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return { key: 'festiveCutoff', value: ok.data, version: versionOf(ok.data) };
}

const answer = (e: unknown): Response => (e instanceof FestiveCutoffError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/** /api/admin/marketing/festive — GET the page (`marketing.campaigns.read`); PUT the card (`marketing.campaigns.write`). */
export async function festiveCutoffHandler(request: Request, deps: AdminDeps | null, now?: () => Date): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.campaigns.read' : 'marketing.campaigns.write', storeId: S });
  if (g instanceof Response) return g;
  const d: FestiveCutoffDeps = { db: deps!.db, resolver: deps!.resolver, ...(now ? { now } : {}) };
  try {
    if (method === 'GET') return json({ ok: true, ...(await festiveCutoffOverview(d)) });
    return json({ ok: true, cards: { festiveCutoff: await saveFestiveCutoffCard(d, { actor: g.actor, ctx: g.ctx }, b) } });
  } catch (e) {
    return answer(e);
  }
}
