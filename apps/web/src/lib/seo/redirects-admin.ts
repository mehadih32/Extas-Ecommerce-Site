// S11 · PR 235 — Website › SEO › Redirects & 404 (`/admin/website/seo/redirects`, demo WEB-04a). `rest` is what comes
// after /api/admin/seo/redirects:
//   GET  /                     the old links that forward (view all · wordpress · renamed · manual · combo · off, a
//                              search), their counts, the WordPress map's state, the open 404s with a suggestion (seo.read)
//   POST /                     { fromPath, toPath } a forward typed in by hand (seo.manage)
//   POST /<id>                 { enabled?, toPath? } switch a forward off or on, or send it elsewhere (seo.manage)
//   POST /import               { text, kind: 'wordpress' | 'manual', commit } the owner's list of old links: without
//                              `commit` only the check (every line with what would happen); with it the lines that pass
//                              are written (seo.manage)
//   POST /not-found/<id>       { action: 'fix', toPath } the one-click fix (a forward from that address) or
//                              { action: 'ignore' | 'unignore' } (seo.manage)
// The rules are PR 590's: no chains (a target that is itself an old link is followed to its end, and every link that
// pointed at the address now points straight at the new one), a forward never takes over a page the shop has (a live
// product, a category, the shop's own pages), nothing is deleted (a forward is switched off). Each write is audited
// (`seo.redirect.*`) and the proxy's table in this process is read again. Nothing here touches money or an order.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { registry } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { ROUTES } from '../shop/routes';
import { forgetRedirectTable, redirectKey, WORDPRESS_SOURCE } from './redirect-table';
import { COMBO_ORDER_SOURCE } from './combo-order';
import { isOwnAddress, parseRedirectCsv, suggestTarget, type Candidate } from './suggest';

export const REDIRECT_VIEWS = ['all', 'wordpress', 'renamed', 'manual', 'combo', 'off'] as const;
export type RedirectView = (typeof REDIRECT_VIEWS)[number];
export type RedirectKind = Exclude<RedirectView, 'all' | 'off'>;

/** The kind the admin shows for a row's source. */
export function kindOf(source: string): RedirectKind {
  if (source === WORDPRESS_SOURCE) return 'wordpress';
  if (source === COMBO_ORDER_SOURCE) return 'combo';
  if (source.endsWith('-slug')) return 'renamed';
  return 'manual';
}

/** The longest list of old links one import takes. */
export const IMPORT_MAX_LINES = 5000;
const PATH_MAX = 500;

export class RedirectError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}

export interface RedirectRowView {
  id: string;
  fromPath: string;
  toPath: string;
  kind: RedirectKind;
  enabled: boolean;
  hits: number;
  lastHitAt: string | null;
  keepUntil: string | null;
  createdAt: string;
}

export interface NotFoundView {
  id: string;
  path: string;
  hits: number;
  firstSeenAt: string;
  lastSeenAt: string;
  referrer: string | null;
  ignored: boolean;
  suggestion: { path: string; label: string; percent: number } | null;
}

export interface RedirectsSnapshot {
  view: RedirectView;
  q: string;
  redirects: RedirectRowView[];
  counts: Record<RedirectView, number>;
  wordpress: { rows: number; live: boolean };
  notFound: { open: NotFoundView[]; openCount: number; ignoredCount: number; fixedCount: number };
  values: {
    'seo.redirects': (typeof registry)['seo.redirects']['default'];
    'seo.notFound': (typeof registry)['seo.notFound']['default'];
    /** PR 586: old demo `#/…` links forwarded (More options). */
    'seo.hashLinks': (typeof registry)['seo.hashLinks']['default'];
  };
  versions: { 'seo.redirects': number; 'seo.notFound': number; 'seo.hashLinks': number };
  defaults: RedirectsSnapshot['values'];
  statusCode: number;
}

type Db = PrismaClient;
type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function rowView(r: { id: string; fromPath: string; toPath: string; source: string; enabled: boolean; hits: number; lastHitAt: Date | null; keepUntil: Date | null; createdAt: Date }): RedirectRowView {
  return { id: r.id, fromPath: r.fromPath, toPath: r.toPath, kind: kindOf(r.source), enabled: r.enabled, hits: r.hits, lastHitAt: iso(r.lastHitAt), keepUntil: iso(r.keepUntil), createdAt: r.createdAt.toISOString() };
}

const SOURCES: Record<RedirectKind, object> = {
  wordpress: { source: WORDPRESS_SOURCE },
  combo: { source: COMBO_ORDER_SOURCE },
  renamed: { source: { endsWith: '-slug' } },
  manual: { NOT: [{ source: WORDPRESS_SOURCE }, { source: COMBO_ORDER_SOURCE }, { source: { endsWith: '-slug' } }] },
};

function viewWhere(storeId: number, view: RedirectView, q: string) {
  const base = { storeId, archivedAt: null, ...(q ? { OR: [{ fromPath: { contains: q } }, { toPath: { contains: q } }] } : {}) };
  if (view === 'all') return base;
  if (view === 'off') return { ...base, enabled: false };
  return { ...base, enabled: true, ...SOURCES[view] };
}

/** The live pages a 404 can be sent to: published products and visible categories. */
async function candidates(db: Db, storeId: number, prefix: string): Promise<Candidate[]> {
  const [products, cats] = await Promise.all([
    db.product.findMany({ where: { storeId, status: 'PUBLISHED', archivedAt: null }, select: { slug: true, nameEn: true }, take: 5000 }),
    db.category.findMany({ where: { storeId, isVisible: true, archivedAt: null }, select: { slug: true, nameEn: true }, take: 1000 }),
  ]);
  const pre = redirectKey(prefix);
  return [...products.map((p) => ({ path: `${pre}/${p.slug}`, label: p.nameEn })), ...cats.map((c) => ({ path: ROUTES.category(c.slug), label: c.nameEn }))];
}

/** What the page draws (the caller has checked `seo.read`). */
export async function redirectsSnapshot(deps: Pick<AdminDeps, 'db' | 'resolver'>, storeId: number, opts: { view?: string; q?: string } = {}): Promise<RedirectsSnapshot> {
  const view: RedirectView = (REDIRECT_VIEWS as readonly string[]).includes(opts.view ?? '') ? (opts.view as RedirectView) : 'all';
  const q = redirectKey(opts.q ?? '') === '/' ? '' : (opts.q ?? '').trim().toLowerCase().slice(0, 200);
  const at = { storeId };
  const [red, nf, hash, status, prefix] = await Promise.all([
    deps.resolver.get('seo.redirects', at),
    deps.resolver.get('seo.notFound', at),
    deps.resolver.get('seo.hashLinks', at),
    deps.resolver.value('naming.redirectStatusCode', at),
    deps.resolver.value('naming.productPathPrefix', at),
  ]);
  const take = red.value.listShown;
  const db = deps.db;
  const [rows, counts, wpRows, open, openCount, ignoredCount, fixedCount, cands] = await Promise.all([
    db.redirect.findMany({ where: viewWhere(storeId, view, q), orderBy: [{ hits: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], take }),
    Promise.all(REDIRECT_VIEWS.map((v) => db.redirect.count({ where: viewWhere(storeId, v, '') }))),
    db.redirect.count({ where: { storeId, archivedAt: null, enabled: true, source: WORDPRESS_SOURCE } }),
    db.notFoundHit.findMany({ where: { storeId, ignoredAt: null, redirectId: null }, orderBy: [{ hits: 'desc' }, { lastSeenAt: 'desc' }], take }),
    db.notFoundHit.count({ where: { storeId, ignoredAt: null, redirectId: null } }),
    db.notFoundHit.count({ where: { storeId, ignoredAt: { not: null } } }),
    db.notFoundHit.count({ where: { storeId, redirectId: { not: null } } }),
    candidates(db, storeId, prefix),
  ]);
  return {
    view,
    q,
    redirects: rows.map(rowView),
    counts: Object.fromEntries(REDIRECT_VIEWS.map((v, i) => [v, counts[i]!])) as Record<RedirectView, number>,
    wordpress: { rows: wpRows, live: red.value.wordpressMapLive },
    notFound: {
      open: open.map((h) => ({
        id: h.id,
        path: h.path,
        hits: h.hits,
        firstSeenAt: h.firstSeenAt.toISOString(),
        lastSeenAt: h.lastSeenAt.toISOString(),
        referrer: h.referrer,
        ignored: false,
        suggestion: suggestTarget(h.path, cands, nf.value.suggestMatchAtLeast),
      })),
      openCount,
      ignoredCount,
      fixedCount,
    },
    values: { 'seo.redirects': red.value, 'seo.notFound': nf.value, 'seo.hashLinks': hash.value },
    versions: { 'seo.redirects': red.version, 'seo.notFound': nf.version, 'seo.hashLinks': hash.version },
    defaults: { 'seo.redirects': registry['seo.redirects'].default, 'seo.notFound': registry['seo.notFound'].default, 'seo.hashLinks': registry['seo.hashLinks'].default },
    statusCode: status,
  };
}

/** Why an address cannot be an old link, or null: empty, too long, the home page, the shop's own pages, a live page. */
async function fromProblem(tx: Tx, storeId: number, prefix: string, from: string): Promise<string | null> {
  if (from === '/' || isOwnAddress(from)) return 'OWN_PAGE';
  if (from.length > PATH_MAX) return 'TOO_LONG';
  const pre = redirectKey(prefix);
  if (from.startsWith(`${pre}/`)) {
    const slug = from.slice(pre.length + 1);
    if (await tx.product.findFirst({ where: { storeId, slug, archivedAt: null }, select: { id: true } })) return 'LIVE_PAGE';
  }
  const cat = ROUTES.category('x').split('/')[1];
  const [, first, slug, extra] = from.split('/');
  if (first === cat && slug && !extra && (await tx.category.findFirst({ where: { storeId, slug, archivedAt: null }, select: { id: true } }))) return 'LIVE_PAGE';
  return null;
}

/** Where a path finally lands after following enabled forwards (a typed target may itself be an old link). */
async function finalTarget(tx: Tx, storeId: number, path: string): Promise<string> {
  let to = redirectKey(path);
  const seen = new Set([to]);
  for (;;) {
    const r = await tx.redirect.findUnique({ where: { storeId_fromPath: { storeId, fromPath: to } } });
    if (!r || !r.enabled || r.archivedAt) return to;
    const next = redirectKey(r.toPath);
    if (seen.has(next)) return to;
    seen.add(next);
    to = next;
  }
}

interface WriteCtx {
  deps: AdminDeps;
  actor: Actor;
  ctx: RequestContext;
  storeId: number;
}

/** Writes `from → to` (no chains, never over a page the shop has). Returns the row and how many older links moved. */
async function putForward(tx: Tx, w: WriteCtx, fromRaw: string, toRaw: string, source: string, keepUntil: Date | null): Promise<{ row: RedirectRowView; repointed: number; created: boolean }> {
  const at = { storeId: w.storeId };
  const [status, prefix] = await Promise.all([w.deps.resolver.value('naming.redirectStatusCode', at), w.deps.resolver.value('naming.productPathPrefix', at)]);
  const from = redirectKey(fromRaw);
  const problem = await fromProblem(tx, w.storeId, prefix, from);
  if (problem) throw new RedirectError(409, problem, ['fromPath']);
  if (redirectKey(toRaw).length > PATH_MAX) throw new RedirectError(400, 'TOO_LONG', ['toPath']);
  const to = await finalTarget(tx, w.storeId, toRaw);
  if (to === from) throw new RedirectError(409, 'SELF', ['toPath']);
  const older = await tx.redirect.findMany({ where: { storeId: w.storeId, toPath: from, enabled: true, archivedAt: null } });
  for (const r of older) {
    await tx.redirect.update({ where: { id: r.id }, data: { toPath: to } });
    await audit(tx as unknown as Db, w.actor, { storeId: w.storeId, action: 'seo.redirect.repoint', entityType: 'Redirect', entityId: r.id, before: { toPath: from }, after: { toPath: to } }, { source: 'admin-api', ...w.ctx });
  }
  const existing = await tx.redirect.findUnique({ where: { storeId_fromPath: { storeId: w.storeId, fromPath: from } } });
  const row = existing
    ? await tx.redirect.update({ where: { id: existing.id }, data: { toPath: to, enabled: true, archivedAt: null, statusCode: status, source, ...(keepUntil ? { keepUntil } : {}) } })
    : await tx.redirect.create({ data: { storeId: w.storeId, fromPath: from, toPath: to, statusCode: status, source, enabled: true, keepUntil } });
  await audit(
    tx as unknown as Db,
    w.actor,
    { storeId: w.storeId, action: existing ? 'seo.redirect.update' : 'seo.redirect.create', entityType: 'Redirect', entityId: row.id, before: existing ? { toPath: existing.toPath, enabled: existing.enabled, source: existing.source } : null, after: { fromPath: from, toPath: to, source } },
    { source: 'admin-api', ...w.ctx },
  );
  return { row: rowView(row), repointed: older.length, created: !existing };
}

const TX = { timeout: 60_000, maxWait: 10_000 } as const;

const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** A forward typed in by hand. */
export async function addRedirect(w: WriteCtx, input: { fromPath: unknown; toPath: unknown }) {
  const from = text(input.fromPath).trim();
  const to = text(input.toPath).trim();
  if (!from || !to) throw new RedirectError(400, 'VALIDATION', [!from ? 'fromPath' : 'toPath']);
  const r = await w.deps.db.$transaction((tx) => putForward(tx, w, from, to, 'manual', null), TX);
  forgetRedirectTable(w.storeId);
  return r;
}

/** Switch a forward off or on, or send it elsewhere. Never deleted. */
export async function changeRedirect(w: WriteCtx, id: string, patch: { enabled?: unknown; toPath?: unknown }) {
  if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') throw new RedirectError(400, 'VALIDATION', ['enabled']);
  if (patch.toPath !== undefined && !text(patch.toPath).trim()) throw new RedirectError(400, 'VALIDATION', ['toPath']);
  const r = await w.deps.db.$transaction(async (tx) => {
    const cur = await tx.redirect.findFirst({ where: { id, storeId: w.storeId, archivedAt: null } });
    if (!cur) throw new RedirectError(404, 'NOT_FOUND');
    const prefix = await w.deps.resolver.value('naming.productPathPrefix', { storeId: w.storeId });
    const enabled = (patch.enabled as boolean | undefined) ?? cur.enabled;
    const to = patch.toPath !== undefined ? await finalTarget(tx, w.storeId, text(patch.toPath)) : redirectKey(cur.toPath);
    if (to === redirectKey(cur.fromPath)) throw new RedirectError(409, 'SELF', ['toPath']);
    if (enabled && !cur.enabled) {
      const problem = await fromProblem(tx, w.storeId, prefix, redirectKey(cur.fromPath));
      if (problem) throw new RedirectError(409, problem, ['fromPath']);
    }
    if (to === redirectKey(cur.toPath) && enabled === cur.enabled) return rowView(cur);
    const row = await tx.redirect.update({ where: { id: cur.id }, data: { toPath: to, enabled } });
    const action = enabled === cur.enabled ? 'seo.redirect.update' : enabled ? 'seo.redirect.enable' : 'seo.redirect.disable';
    await audit(tx as unknown as Db, w.actor, { storeId: w.storeId, action, entityType: 'Redirect', entityId: cur.id, before: { toPath: cur.toPath, enabled: cur.enabled }, after: { toPath: to, enabled } }, { source: 'admin-api', ...w.ctx });
    return rowView(row);
  }, TX);
  forgetRedirectTable(w.storeId);
  return r;
}

export type ImportStatus = 'ok' | 'update' | 'same' | 'empty' | 'self' | 'own' | 'live' | 'twice' | 'long';

export interface ImportLine {
  line: number;
  from: string;
  to: string;
  status: ImportStatus;
}

/** Checks (and with `commit` writes) the owner's list of old links. */
export async function importRedirects(w: WriteCtx, input: { text: unknown; kind: unknown; commit: unknown }) {
  const kind = input.kind === 'manual' ? 'manual' : input.kind === 'wordpress' ? WORDPRESS_SOURCE : null;
  if (!kind) throw new RedirectError(400, 'VALIDATION', ['kind']);
  const rows = parseRedirectCsv(text(input.text));
  if (rows.length === 0) throw new RedirectError(400, 'EMPTY', ['text']);
  if (rows.length > IMPORT_MAX_LINES) throw new RedirectError(400, 'TOO_MANY', [String(IMPORT_MAX_LINES)]);
  const at = { storeId: w.storeId };
  const [prefix, set] = await Promise.all([w.deps.resolver.value('naming.productPathPrefix', at), w.deps.resolver.value('seo.redirects', at)]);
  const seen = new Set<string>();
  const lines: ImportLine[] = [];
  const db = w.deps.db;
  for (const r of rows) {
    const from = r.from ? redirectKey(r.from) : '';
    const to = r.to ? redirectKey(r.to) : '';
    let status: ImportStatus;
    if (!from || !to) status = 'empty';
    else if (from.length > PATH_MAX || to.length > PATH_MAX) status = 'long';
    else if (from === to) status = 'self';
    else if (seen.has(from)) status = 'twice';
    else {
      const problem = await fromProblem(db as unknown as Tx, w.storeId, prefix, from);
      if (problem === 'OWN_PAGE') status = 'own';
      else if (problem === 'LIVE_PAGE') status = 'live';
      else {
        const cur = await db.redirect.findUnique({ where: { storeId_fromPath: { storeId: w.storeId, fromPath: from } } });
        status = !cur ? 'ok' : cur.enabled && !cur.archivedAt && redirectKey(cur.toPath) === to ? 'same' : 'update';
      }
    }
    if (from) seen.add(from);
    lines.push({ line: r.line, from: from || r.from, to: to || r.to, status });
  }
  const tally = Object.fromEntries((['ok', 'update', 'same', 'empty', 'self', 'own', 'live', 'twice', 'long'] as const).map((s) => [s, lines.filter((l) => l.status === s).length])) as Record<ImportStatus, number>;
  if (input.commit !== true) return { committed: false, lines, tally, written: 0 };
  const keepUntil = new Date((w.deps.now?.() ?? new Date()).getTime());
  keepUntil.setUTCMonth(keepUntil.getUTCMonth() + set.keepMonths);
  let written = 0;
  await db.$transaction(async (tx) => {
    for (const l of lines) {
      if (l.status !== 'ok' && l.status !== 'update') continue;
      await putForward(tx, w, l.from, l.to, kind, keepUntil);
      written++;
    }
    await audit(tx as unknown as Db, w.actor, { storeId: w.storeId, action: 'seo.redirect.import', entityType: 'Redirect', entityId: kind, before: null, after: { kind, written, tally } }, { source: 'admin-api', ...w.ctx });
  }, { timeout: 300_000, maxWait: 10_000 });
  forgetRedirectTable(w.storeId);
  return { committed: true, lines, tally, written };
}

/** The 404 report's one-click fix (a forward from that address) or its ignore / unignore. */
export async function actOnNotFound(w: WriteCtx, id: string, input: { action: unknown; toPath?: unknown }) {
  const hit = await w.deps.db.notFoundHit.findFirst({ where: { id, storeId: w.storeId } });
  if (!hit) throw new RedirectError(404, 'NOT_FOUND');
  if (input.action === 'ignore' || input.action === 'unignore') {
    const ignoredAt = input.action === 'ignore' ? (w.deps.now?.() ?? new Date()) : null;
    await w.deps.db.notFoundHit.update({ where: { id }, data: { ignoredAt } });
    await audit(w.deps.db, w.actor, { storeId: w.storeId, action: `seo.notFound.${input.action}`, entityType: 'NotFoundHit', entityId: id, before: { ignored: hit.ignoredAt !== null }, after: { ignored: ignoredAt !== null } }, { source: 'admin-api', ...w.ctx });
    return { ok: true };
  }
  if (input.action !== 'fix') throw new RedirectError(400, 'VALIDATION', ['action']);
  const to = text(input.toPath).trim();
  if (!to) throw new RedirectError(400, 'VALIDATION', ['toPath']);
  const r = await w.deps.db.$transaction(async (tx) => {
    const put = await putForward(tx, w, hit.path, to, 'manual', null);
    await tx.notFoundHit.update({ where: { id }, data: { redirectId: put.row.id, ignoredAt: null } });
    return put;
  }, TX);
  forgetRedirectTable(w.storeId);
  return r;
}

/** Every Website › SEO › Redirects & 404 route. */
export async function seoRedirectsRoute(request: Request, deps: AdminDeps | null, rest: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m !== 'GET' && m !== 'POST') return fail(405, 'method-not-allowed');
  if (m === 'GET' && rest.length > 0) return fail(404, 'not-found');
  const g = await guardAdmin(request, deps, { permission: m === 'GET' ? 'seo.read' : 'seo.manage', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = deps as AdminDeps;
  const w: WriteCtx = { deps: d, actor: g.actor, ctx: g.ctx, storeId: MOTHER_STORE_ID };
  try {
    if (m === 'GET') {
      const u = new URL(request.url);
      return json({ ok: true, ...(await redirectsSnapshot(d, MOTHER_STORE_ID, { view: u.searchParams.get('view') ?? undefined, q: u.searchParams.get('q') ?? undefined })) });
    }
    const b = await body(request);
    const uuid = (s: string | undefined) => Boolean(s && /^[0-9a-f-]{36}$/i.test(s));
    if (rest.length === 0) return json({ ok: true, ...(await addRedirect(w, { fromPath: b.fromPath, toPath: b.toPath })) });
    if (rest.length === 1 && rest[0] === 'import') return json({ ok: true, ...(await importRedirects(w, { text: b.text, kind: b.kind, commit: b.commit })) });
    if (rest.length === 1 && uuid(rest[0])) return json({ ok: true, row: await changeRedirect(w, rest[0]!, { enabled: b.enabled, toPath: b.toPath }) });
    if (rest.length === 2 && rest[0] === 'not-found' && uuid(rest[1])) return json({ ok: true, ...(await actOnNotFound(w, rest[1]!, { action: b.action, toPath: b.toPath })) });
    return fail(404, 'not-found');
  } catch (e) {
    if (e instanceof RedirectError) return fail(e.status, e.code, e.details);
    return errorResponse(e);
  }
}
