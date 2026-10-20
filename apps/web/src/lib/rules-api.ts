// S10 · PR 208–219 — the Smart Rules admin API. The Smart Rules page (`/admin/rules`, PR 209) and the notices page
// (`/admin/rules/notices`, PR 216) call these routes. Every route signs the person in (guardAdmin), checks the
// permission in the store it touches (`?storeId=`, default the mother store), then calls @extas/rules, which checks the
// permission again (and the owner's OK for money, `rules.approve`) and writes the audit log. Answers are
// `{ ok: true, … }` or `{ ok: false, error: CODE, details }`. One catch-all route (app/api/admin/rules/[[...path]])
// hands every path to `rulesRoute`.
//
//   GET   /api/admin/rules                      the rules (?kind=, ?includeArchived=1) with counts per kind
//   POST  /api/admin/rules                      new rule {templateId} or {key, kind, nameEn} — always a draft
//   GET   /api/admin/rules/templates            the templates (and which ones the store has)
//   POST  /api/admin/rules/starters             the store's starter rules, as drafts (once)
//   POST  /api/admin/rules/check                {content} — every reason it could not go live
//   GET   /api/admin/rules/:id                  one rule: live version, draft, filled-in texts, issues
//   PUT   /api/admin/rules/:id/draft            {content, version?} save the draft
//   POST  /api/admin/rules/:id/discard          throw the draft away
//   POST  /api/admin/rules/:id/preview          {content?} what changes where (PR 209 "Preview changes")
//   POST  /api/admin/rules/:id/publish          {changeNote?, version?} the draft becomes the next version
//   POST  /api/admin/rules/:id/status           {status} switch on, pause, end
//   POST  /api/admin/rules/:id/archive          {archived} archive (paused first) or bring back
//   GET   /api/admin/rules/:id/history          ?before= versions with what changed (PR 218)
//   POST  /api/admin/rules/:id/history          {version} bring an old version back as the draft
//   GET   /api/admin/rules/:id/simulate         earlier simulations · POST {days?, content?} run one (PR 219)
//   GET   /api/admin/rules/conflicts            open clashes (?includeResolved=1, ?ruleId=) (PR 217)
//   POST  /api/admin/rules/conflicts            {action: "check" | "fixAll"}
//   POST  /api/admin/rules/conflicts/:id        {action: "fix"} · {action: "resolve", resolution}
//   GET   /api/admin/rules/notices              notices (?includeArchived=1) · POST a new one (off) (PR 216)
//   GET   /api/admin/rules/notices/:id          one notice · PUT {notice, version?} change · POST {enabled} | {archived}
//   GET   /api/admin/rules/coupons              coupons (?ruleId=) · POST a new one (off) (PR 213)
//   POST  /api/admin/rules/coupons/:id          {enabled} (the owner's OK) | {archived}
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as rl from '@extas/rules';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';

export type RulesPerm = 'rules.read' | 'rules.write' | 'rules.publish' | 'rules.approve';

interface Ctx {
  deps: rl.RulesDeps;
  who: rl.Who;
  url: URL;
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export const rulesDeps = (deps: AdminDeps): rl.RulesDeps => ({ db: deps.db, settings: deps.resolver, now: deps.now });

async function handle(request: Request, deps: AdminDeps | null, permission: RulesPerm, fn: (c: Ctx) => Promise<Record<string, unknown> | Response>, status = 200): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const out = await fn({ deps: rulesDeps(deps!), who: { actor: g.actor, storeId, ctx: g.ctx }, url });
    return out instanceof Response ? out : json({ ok: true, ...out }, { status });
  } catch (e) {
    return errorResponse(e);
  }
}

const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const notFound = () => Promise.resolve(fail(404, 'not-found'));
const flag = (url: URL, k: string) => ['1', 'true'].includes(url.searchParams.get(k) ?? '');
const asRecord = (v: unknown) => v as unknown as Record<string, unknown>;

/** Every Smart Rules route: `path` is what comes after /api/admin/rules. */
export async function rulesRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, b, c] = path;
  if (path.length > 3) return notFound();

  // ---- the list, templates, starters, check ----
  if (a === undefined) {
    if (m === 'GET')
      return handle(request, deps, 'rules.read', async (x) => {
        const kind = x.url.searchParams.get('kind') || undefined;
        return asRecord(await rl.listRules(x.deps, x.who, { ...(kind ? { kind } : {}), includeArchived: flag(x.url, 'includeArchived') }));
      });
    if (m === 'POST') return handle(request, deps, 'rules.write', async (x) => ({ rule: await rl.createRule(x.deps, x.who, await body(request)) }), 201);
    return notAllowed();
  }
  if (a === 'templates' && !b) return m === 'GET' ? handle(request, deps, 'rules.read', async (x) => ({ templates: await rl.listTemplates(x.deps, x.who) })) : notAllowed();
  if (a === 'starters' && !b) return m === 'POST' ? handle(request, deps, 'rules.write', async (x) => asRecord(await rl.addStarterRules(x.deps, x.who))) : notAllowed();
  if (a === 'check' && !b) return m === 'POST' ? handle(request, deps, 'rules.read', async (x) => asRecord(await rl.checkCandidate(x.deps, x.who, (await body(request)).content))) : notAllowed();

  // ---- conflicts ----
  if (a === 'conflicts') {
    if (!b) {
      if (m === 'GET')
        return handle(request, deps, 'rules.read', async (x) => {
          const ruleId = x.url.searchParams.get('ruleId') || undefined;
          if (ruleId && !isUuid(ruleId)) return fail(400, 'INVALID_INPUT', ['ruleId']);
          return { conflicts: await rl.listConflicts(x.deps, x.who, { includeResolved: flag(x.url, 'includeResolved'), ruleId }) };
        });
      if (m === 'POST')
        return handle(request, deps, 'rules.read', async (x) => {
          const action = (await body(request)).action;
          if (action === 'check') return { check: await rl.refreshConflicts(x.deps, x.who.storeId), conflicts: await rl.listConflicts(x.deps, x.who) };
          if (action === 'fixAll') return { result: await rl.fixAllConflicts(x.deps, x.who), conflicts: await rl.listConflicts(x.deps, x.who) };
          return fail(400, 'INVALID_INPUT', ['action']);
        });
      return notAllowed();
    }
    if (c || !isUuid(b)) return fail(400, 'INVALID_INPUT', ['id']);
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'rules.publish', async (x) => {
      const input = await body(request);
      if (input.action === 'fix') return { result: await rl.fixConflict(x.deps, x.who, b), conflicts: await rl.listConflicts(x.deps, x.who) };
      if (input.action === 'resolve') return { conflict: await rl.resolveConflict(x.deps, x.who, b, { resolution: input.resolution, ...(input.note ? { note: input.note } : {}) }) };
      return fail(400, 'INVALID_INPUT', ['action']);
    });
  }

  // ---- notices ----
  if (a === 'notices') {
    if (!b) {
      if (m === 'GET') return handle(request, deps, 'rules.read', async (x) => ({ notices: await rl.listNotices(x.deps, x.who, { includeArchived: flag(x.url, 'includeArchived') }) }));
      if (m === 'POST') return handle(request, deps, 'rules.write', async (x) => ({ notice: await rl.createNotice(x.deps, x.who, await body(request)) }), 201);
      return notAllowed();
    }
    if (c || !isUuid(b)) return fail(400, 'INVALID_INPUT', ['id']);
    if (m === 'GET') return handle(request, deps, 'rules.read', async (x) => ({ notice: await rl.getNotice(x.deps, x.who, b) }));
    if (m === 'PUT') return handle(request, deps, 'rules.write', async (x) => ({ notice: await rl.updateNotice(x.deps, x.who, b, await body(request)) }));
    if (m === 'POST')
      return handle(request, deps, 'rules.publish', async (x) => {
        const input = await body(request);
        if ('archived' in input) return { notice: await rl.archiveNotice(x.deps, x.who, b, input) };
        return { notice: await rl.setNoticeEnabled(x.deps, x.who, b, input) };
      });
    return notAllowed();
  }

  // ---- coupons ----
  if (a === 'coupons') {
    if (!b) {
      if (m === 'GET')
        return handle(request, deps, 'rules.read', async (x) => {
          const ruleId = x.url.searchParams.get('ruleId') || undefined;
          if (ruleId && !isUuid(ruleId)) return fail(400, 'INVALID_INPUT', ['ruleId']);
          return { coupons: await rl.listCoupons(x.deps, x.who, { ruleId, includeArchived: flag(x.url, 'includeArchived') }) };
        });
      if (m === 'POST') return handle(request, deps, 'rules.write', async (x) => ({ coupon: await rl.createCoupon(x.deps, x.who, await body(request)) }), 201);
      return notAllowed();
    }
    if (c || !isUuid(b)) return fail(400, 'INVALID_INPUT', ['id']);
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'rules.read', async (x) => {
      const input = await body(request);
      if ('archived' in input) return { coupon: await rl.archiveCoupon(x.deps, x.who, b, input) };
      return { coupon: await rl.setCouponEnabled(x.deps, x.who, b, input) };
    });
  }

  // ---- one rule ----
  if (!isUuid(a)) return fail(400, 'INVALID_INPUT', ['id']);
  const id = a;
  if (c) return notFound();
  switch (b) {
    case undefined:
      return m === 'GET' ? handle(request, deps, 'rules.read', async (x) => ({ rule: await rl.getRule(x.deps, x.who, id) })) : notAllowed();
    case 'draft':
      return m === 'PUT' ? handle(request, deps, 'rules.write', async (x) => ({ rule: await rl.saveDraft(x.deps, x.who, id, await body(request)) })) : notAllowed();
    case 'discard':
      return m === 'POST' ? handle(request, deps, 'rules.write', async (x) => ({ rule: await rl.discardDraft(x.deps, x.who, id) })) : notAllowed();
    case 'preview':
      return m === 'POST' ? handle(request, deps, 'rules.read', async (x) => ({ preview: await rl.previewRule(x.deps, x.who, id, await body(request)) })) : notAllowed();
    case 'publish':
      return m === 'POST' ? handle(request, deps, 'rules.publish', async (x) => asRecord(await rl.publishRule(x.deps, x.who, id, await body(request)))) : notAllowed();
    case 'status':
      return m === 'POST' ? handle(request, deps, 'rules.publish', async (x) => asRecord(await rl.setRuleStatus(x.deps, x.who, id, await body(request)))) : notAllowed();
    case 'archive':
      return m === 'POST' ? handle(request, deps, 'rules.publish', async (x) => asRecord(await rl.archiveRule(x.deps, x.who, id, await body(request)))) : notAllowed();
    case 'history':
      if (m === 'GET')
        return handle(request, deps, 'rules.read', async (x) => {
          const before = x.url.searchParams.get('before');
          return asRecord(await rl.ruleHistory(x.deps, x.who, id, before ? { before: Number(before) } : {}));
        });
      if (m === 'POST') return handle(request, deps, 'rules.write', async (x) => ({ rule: await rl.restoreVersion(x.deps, x.who, id, await body(request)) }));
      return notAllowed();
    case 'simulate':
      if (m === 'GET') return handle(request, deps, 'rules.read', async (x) => ({ simulations: await rl.listSimulations(x.deps, x.who, id) }));
      if (m === 'POST') return handle(request, deps, 'rules.read', async (x) => ({ simulation: await rl.simulateRule(x.deps, x.who, id, await body(request)) }));
      return notAllowed();
    default:
      return notFound();
  }
}
