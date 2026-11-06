// S13 · PR 279 (register "SEO outreach pipeline"; ADMIN-ARCHITECTURE 4.8 Marketing › More options) — Marketing › SEO
// outreach. Off as it ships (`marketing.outreach`).
// - Prospects: the websites the owner asks for a link to his shop (a blog, a news site, a fashion page), each added by
//   its address (kept as its bare host, e.g. `example.com`, once per store), with the person to write to and notes.
// - The pipeline: found → asked → answered → link live, or said no. Marking a site "asked" without a follow-up day sets
//   one `followUpDays` later (0 = none); a found, asked or answered site whose day has come is "follow up due". "Link
//   live" needs the address of the page on that site where the link sits, and keeps when it went live.
// - "Write to them": when the contact holds an e-mail address and the owner wrote his pitch words, the page builds a
//   `mailto:` link that only opens the owner's own e-mail app with those words; he reads them and sends it himself.
//   Nothing is ever sent from the shop, nothing is fetched from those sites, no money moves.
// Seeing needs `marketing.campaigns.read`; adding and changing need `marketing.campaigns.write`, the settings card too.
// Set aside (archived), never deleted. Every change is audited.
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import { outreachSettingsSchema, storeTarget, type OutreachSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import type { AdPlatformsWho } from './ad-platforms';

const S = MOTHER_STORE_ID;
/** The pipeline's stages, in order (codes; their words are in the page's messages). */
export const OUTREACH_STAGES = ['FOUND', 'ASKED', 'ANSWERED', 'LIVE', 'DECLINED'] as const;
export type OutreachStage = (typeof OUTREACH_STAGES)[number];
/** The stages that still wait on a next step (a follow-up day can fall due). */
const OPEN_STAGES: readonly OutreachStage[] = ['FOUND', 'ASKED', 'ANSWERED'];
/** Prospects shown on the page (a page-length guard, not a business number). */
const PROSPECTS_SHOWN = 500; // hardcode-ok: a page-length guard
const DAY_MS = 86_400_000; // hardcode-ok: a unit

export class OutreachError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface OutreachDeps {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
  now?: () => Date;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isStage = (v: unknown): v is OutreachStage => typeof v === 'string' && (OUTREACH_STAGES as readonly string[]).includes(v);

/** A website's bare host (lower case, without `www.`) from its address or as typed; null when it is not one. */
export function siteOf(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 300 || /\s/.test(s)) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '');
  return /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host) && /[a-z]/.test(host.split('.').pop()!) ? host : null;
}

/** The live link's page: an http(s) address on the prospect's site (or one of its sub-sites); null otherwise. */
export function liveLinkOf(v: unknown, site: string): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 500) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return host === site || host.endsWith(`.${site}`) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The first e-mail address in a contact line ("Rahim, rahim@example.com"); null when there is none. */
export function emailOf(contact: string | null | undefined): string | null {
  const m = (contact ?? '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/);
  return m ? m[0] : null;
}

/** The owner's pitch words with `{site}` and `{shop}` filled in. */
export const fillPitch = (text: string, v: { site: string; shop: string }): string => text.replaceAll('{site}', v.site).replaceAll('{shop}', v.shop);

/** A `mailto:` link that opens the owner's own e-mail app with the pitch (nothing is sent by the shop). */
export function pitchMailto(email: string, subject: string, text: string): string {
  const q = [subject ? `subject=${encodeURIComponent(subject)}` : '', text ? `body=${encodeURIComponent(text)}` : ''].filter(Boolean).join('&');
  return `mailto:${encodeURIComponent(email).replace('%40', '@')}${q ? `?${q}` : ''}`;
}

/** A calendar day (`YYYY-MM-DD`) as UTC midnight; null when empty; undefined when it is not a real day. */
function dayOf(v: unknown): Date | null | undefined {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return undefined;
  const d = new Date(`${v.trim()}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v.trim() ? undefined : d;
}

const startOfDay = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export interface OutreachRow {
  id: string;
  site: string;
  contact: string;
  email: string | null;
  status: OutreachStage;
  linkUrl: string | null;
  notes: string;
  nextStepOn: string | null;
  liveAt: string | null;
  archived: boolean;
  /** Found, asked or answered, and its follow-up day has come. */
  due: boolean;
}

export interface OutreachOverview {
  settings: OutreachSettings;
  card: { key: 'outreach'; value: OutreachSettings; version: string };
  prospects: OutreachRow[];
  /** The live (not set aside) prospects in each stage, the ones whose follow-up is due, and the links live. */
  totals: { byStage: Record<OutreachStage, number>; due: number; all: number };
}

const settingsOf = async (deps: OutreachDeps): Promise<OutreachSettings> => (await deps.resolver.value('marketing.outreach', { storeId: S })) as OutreachSettings;

/** Marketing › SEO outreach: the settings, every prospect with its stage and follow-up, and the counts per stage. */
export async function outreachOverview(deps: OutreachDeps): Promise<OutreachOverview> {
  const settings = await settingsOf(deps);
  const now = deps.now?.() ?? new Date();
  const rows = await deps.db.outreachProspect.findMany({ where: { storeId: S }, orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { nextStepAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }], take: PROSPECTS_SHOWN });
  const prospects: OutreachRow[] = rows.map((r) => {
    const status: OutreachStage = isStage(r.status) ? r.status : 'FOUND';
    return {
      id: r.id,
      site: r.site,
      contact: r.contact ?? '',
      email: emailOf(r.contact),
      status,
      linkUrl: r.linkUrl,
      notes: r.notes ?? '',
      nextStepOn: r.nextStepAt ? r.nextStepAt.toISOString().slice(0, 10) : null,
      liveAt: r.liveAt ? r.liveAt.toISOString() : null,
      archived: r.archivedAt !== null,
      due: r.archivedAt === null && OPEN_STAGES.includes(status) && !!r.nextStepAt && r.nextStepAt.getTime() <= now.getTime(),
    };
  });
  const live = prospects.filter((p) => !p.archived);
  const byStage = Object.fromEntries(OUTREACH_STAGES.map((s) => [s, live.filter((p) => p.status === s).length])) as Record<OutreachStage, number>;
  return {
    settings,
    card: { key: 'outreach', value: settings, version: versionOf(settings) },
    prospects,
    totals: { byStage, due: live.filter((p) => p.due).length, all: live.length },
  };
}

/** PUT: the settings card ({key: 'outreach', value, version}). Audited. */
export async function saveOutreachCard(deps: OutreachDeps, who: AdPlatformsWho, input: unknown): Promise<OutreachOverview['card']> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'outreach') throw new OutreachError('INVALID_INPUT', 400, ['key']);
  const before = await settingsOf(deps);
  if (o.version !== versionOf(before)) throw new OutreachError('STALE', 409);
  const ok = outreachSettingsSchema.safeParse(o.value);
  if (!ok.success) throw new OutreachError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('marketing.outreach', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › SEO outreach' });
    await audit(deps.db, who.actor, { storeId: S, action: 'outreach.settings', entityType: 'Setting', entityId: 'marketing.outreach', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return { key: 'outreach', value: ok.data, version: versionOf(ok.data) };
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST {action}: `prospect.add` {site, contact?, notes?} · `prospect.update` {id, status, contact, notes, linkUrl,
 * nextStepOn} · `prospect.archive` / `prospect.restore` {id}. Only while the pipeline is on (setting aside works when
 * off). Audited.
 */
export async function outreachAction(deps: OutreachDeps, who: AdPlatformsWho, b: Record<string, unknown>): Promise<{ id: string }> {
  const action = typeof b.action === 'string' ? b.action : '';
  const settings = await settingsOf(deps);
  if (!settings.enabled && action !== 'prospect.archive') throw new OutreachError('SWITCHED_OFF', 409, ['marketing.outreach']);
  const now = deps.now?.() ?? new Date();
  const id = typeof b.id === 'string' && UUID_RE.test(b.id) ? b.id : null;
  const log = (entityId: string, after: Record<string, unknown>, before?: Record<string, unknown>) => audit(deps.db, who.actor, { storeId: S, action: `outreach.${action}`, entityType: 'OutreachProspect', entityId, ...(before ? { before } : {}), after }, who.ctx);

  if (action === 'prospect.add') {
    const site = siteOf(b.site);
    if (!site) throw new OutreachError('INVALID_INPUT', 400, ['site']);
    const was = await deps.db.outreachProspect.findFirst({ where: { storeId: S, site }, select: { id: true } });
    if (was) throw new OutreachError('EXISTS', 409, ['site']);
    const contact = str(b.contact, 200) || null;
    const notes = str(b.notes, 2000) || null;
    const row = await deps.db.outreachProspect.create({ data: { storeId: S, site, contact, notes, status: 'FOUND' } });
    await log(row.id, { site, contact, notes, status: 'FOUND' });
    return { id: row.id };
  }
  if (action === 'prospect.update') {
    const row = id ? await deps.db.outreachProspect.findFirst({ where: { id, storeId: S } }) : null;
    if (!row) throw new OutreachError('NOT_FOUND', 404, ['id']);
    if (row.archivedAt) throw new OutreachError('NOT_FOUND', 404, ['id']);
    const status = isStage(b.status) ? b.status : null;
    const rawLink = str(b.linkUrl, 600);
    const linkUrl = rawLink ? liveLinkOf(rawLink, row.site) : null;
    const day = dayOf(b.nextStepOn);
    const bad = [status ? '' : 'status', rawLink && !linkUrl ? 'linkUrl' : '', status === 'LIVE' && !linkUrl && !rawLink ? 'linkUrl' : '', day === undefined ? 'nextStepOn' : ''].filter(Boolean);
    if (bad.length) throw new OutreachError('INVALID_INPUT', 400, [...new Set(bad)]);
    const asked = status === 'ASKED' && row.status !== 'ASKED';
    const nextStepAt = day ?? (asked && settings.followUpDays > 0 ? new Date(startOfDay(now).getTime() + settings.followUpDays * DAY_MS) : null);
    const liveAt = status === 'LIVE' ? (row.status === 'LIVE' && row.liveAt ? row.liveAt : now) : null;
    const data = { status: status!, contact: str(b.contact, 200) || null, notes: str(b.notes, 2000) || null, linkUrl, nextStepAt, liveAt };
    await deps.db.outreachProspect.update({ where: { id: row.id }, data });
    await log(row.id, { ...data }, { status: row.status, contact: row.contact, notes: row.notes, linkUrl: row.linkUrl, nextStepAt: row.nextStepAt, liveAt: row.liveAt });
    return { id: row.id };
  }
  if (action === 'prospect.archive' || action === 'prospect.restore') {
    const row = id ? await deps.db.outreachProspect.findFirst({ where: { id, storeId: S } }) : null;
    if (!row) throw new OutreachError('NOT_FOUND', 404, ['id']);
    await deps.db.outreachProspect.update({ where: { id: row.id }, data: { archivedAt: action === 'prospect.archive' ? (row.archivedAt ?? now) : null } });
    await log(row.id, { archived: action === 'prospect.archive' });
    return { id: row.id };
  }
  throw new OutreachError('INVALID_INPUT', 400, ['action']);
}

const answer = (e: unknown): Response => (e instanceof OutreachError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ? json({ ok: false, error: 'EXISTS', details: ['site'] }, { status: 409 }) : errorResponse(e));

/** /api/admin/marketing/outreach — GET the page (`marketing.campaigns.read`); PUT the card and POST an action (`marketing.campaigns.write`). */
export async function outreachHandler(request: Request, deps: AdminDeps | null, now?: () => Date): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.campaigns.read' : 'marketing.campaigns.write', storeId: S });
  if (g instanceof Response) return g;
  const d: OutreachDeps = { db: deps!.db, resolver: deps!.resolver, ...(now ? { now } : {}) };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') return json({ ok: true, ...(await outreachOverview(d)) });
    if (method === 'PUT') return json({ ok: true, cards: { outreach: await saveOutreachCard(d, who, b) } });
    return json({ ok: true, ...(await outreachAction(d, who, b as Record<string, unknown>)) });
  } catch (e) {
    return answer(e);
  }
}
