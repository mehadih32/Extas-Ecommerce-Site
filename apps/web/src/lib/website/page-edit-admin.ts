// S02 · PR 600 (register "On-page edit mode"; Blueprint D10.6) — the server side of editing a shop page in place.
// /api/admin/website/page-edit, for the signed-in owner (super admin) with `website.layout.write` only, while
// `shop.pageEdit` is on (everyone else: refused, nothing read):
//   GET              the bar's state: the switch's options, the draft (which settings it changes), the last publish
//   POST page        the page's sections, shown or hidden, and its money links
//   POST section     one section's own settings (page-edit-model sectionDef) with the draft's or the live values
//   POST set         one field into the owner's draft (checked against the setting's rules; nothing goes live)
//   POST discard     the draft set aside (kept, never deleted; audited)
//   POST publish     the draft goes live through the saved-looks path (PR 597 applyLook: the look before it is saved
//                    first, the write is all or nothing, logged in LayoutRestore and audited website.look.restore), then
//                    website.pageEdit.publish is audited with the phone answer and the checks. "Apply to phone too?":
//                    yes needs the phone checks passed and the owner's OK; no keeps what can be kept to computers and
//                    leaves the rest in the draft.
//   POST undo        the newest publish undone (PR 597 undo: itself undoable).
// The draft is a LayoutSnapshot of the scope 'edit-draft' per owner (never listed as a look): its settings and the
// version each setting had when the draft first changed it (STALE when someone else changed it since).
// Nothing here touches a price, a discount, COD, an order or a customer: money is only linked (page-edit-model).
import { audit, isOwner, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type Prisma, type PrismaClient } from '@extas/db/client';
import type { PageEdit } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { fullLayout, type LayoutRow } from '../shop/layouts';
import { shopT, type LabelOverrides } from '../shop/dict';
import { applyLook, LookError, lookAction, lookNow, type LookDeps, type LookWho } from './launch-default-admin';
import { isShopLook, lookOf, versionOf as lookVersion } from './look-model';
import { applyField, desktopOnly, EDIT_KEYS, EDIT_PAGES, EditInputError, LOCKED_PAGES, pageMoney, readField, sectionDef, versionOf, type EditKey, type EditPage, type FieldDef, type MoneyLink } from './page-edit-model';

const S = MOTHER_STORE_ID;
export const DRAFT_SCOPE = 'edit-draft';
/** The name an on-page publish carries in Website › Launch default's list (the owner's own text is never needed). */
const PUBLISH_NAME = 'On-page edit';
// hardcode-ok: list and text guards
const ID_MAX = 40;
const PATH_MAX = 300;
const RESTORES_READ = 30;

export class PageEditError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface EditDraft {
  settings: Partial<Record<EditKey, unknown>>;
  /** The version each setting had when the draft first changed it. */
  base: Partial<Record<EditKey, string>>;
}

export interface EditWho {
  actor: Actor;
  ctx: RequestContext;
  can: (perm: string) => boolean;
}

/** The draft in a snapshot's payload (anything else reads as an empty draft). */
export function draftOf(payload: unknown): EditDraft {
  const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  if (p.scope !== DRAFT_SCOPE) return { settings: {}, base: {} };
  const s = p.settings && typeof p.settings === 'object' ? (p.settings as Record<string, unknown>) : {};
  const b = p.base && typeof p.base === 'object' ? (p.base as Record<string, unknown>) : {};
  const settings: EditDraft['settings'] = {};
  const base: EditDraft['base'] = {};
  for (const k of EDIT_KEYS) {
    if (k in s) settings[k] = s[k];
    if (typeof b[k] === 'string') base[k] = b[k] as string;
  }
  return { settings, base };
}

/** The owner's open draft row (the newest not set aside). */
export async function findDraft(db: PrismaClient, staffUserId: string) {
  return db.layoutSnapshot.findFirst({ where: { storeId: S, createdById: staffUserId, archivedAt: null, payload: { path: ['scope'], equals: DRAFT_SCOPE } }, orderBy: { createdAt: 'desc' } });
}

async function liveValues(deps: LookDeps): Promise<Record<EditKey, unknown>> {
  const vals = await Promise.all(EDIT_KEYS.map((k) => deps.resolver.value(k, { storeId: S })));
  return Object.fromEntries(EDIT_KEYS.map((k, i) => [k, vals[i]])) as Record<EditKey, unknown>;
}

async function saveDraft(deps: LookDeps, who: EditWho, rowId: string | null, d: EditDraft) {
  const payload = { scope: DRAFT_SCOPE, settings: d.settings, base: d.base } as unknown as Prisma.InputJsonValue;
  if (rowId) return deps.db.layoutSnapshot.update({ where: { id: rowId }, data: { payload } });
  return deps.db.layoutSnapshot.create({ data: { storeId: S, name: 'On-page edit draft', payload, createdById: who.actor.staffUserId ?? null } });
}

// ---- views ------------------------------------------------------------------------------------------------------------

export interface FieldView extends FieldDef {
  value: unknown;
  /** The value live on the shop now (the draft's differs when `changed`). */
  live: unknown;
  changed: boolean;
  /** A shop label's words as the shop shows them now (English and Bengali). */
  shown?: { en: string; bn: string };
}

export interface SectionView {
  page: EditPage;
  id: string;
  locked: boolean;
  fields: FieldView[];
  money: MoneyLink[];
  more: MoneyLink | null;
}

export interface LastPublish {
  restoreId: string;
  at: string;
  canUndo: boolean;
}

export interface EditView {
  cfg: PageEdit;
  /** Settings the draft changes. */
  draft: EditKey[];
  last: LastPublish | null;
  /** Words on the page can be edited with the words panel (PR 79) while its switch is on. */
  frontEdit: boolean;
}

async function lastPublish(deps: LookDeps, staffUserId: string): Promise<LastPublish | null> {
  const rows = (await deps.db.layoutRestore.findMany({ where: { storeId: S }, orderBy: { createdAt: 'desc' }, take: RESTORES_READ, include: { snapshot: { select: { payload: true } } } })).filter((r) => isShopLook(r.snapshot.payload));
  const mine = rows.find((r) => !r.undoOfId && lookOf(r.snapshot.payload).auto?.kind === 'edit' && r.actorId === staffUserId);
  if (!mine) return null;
  const undone = await deps.db.layoutRestore.count({ where: { undoOfId: mine.id } });
  return { restoreId: mine.id, at: mine.createdAt.toISOString(), canUndo: rows[0]?.id === mine.id && !undone };
}

export async function editView(deps: LookDeps, staffUserId: string): Promise<EditView> {
  const [cfg, row, last, front] = await Promise.all([
    deps.resolver.value('shop.pageEdit', { storeId: S }),
    findDraft(deps.db, staffUserId),
    lastPublish(deps, staffUserId),
    deps.resolver.value('language.frontEdit', { storeId: S }),
  ]);
  return { cfg: cfg as PageEdit, draft: Object.keys(draftOf(row?.payload).settings) as EditKey[], last, frontEdit: !!(front as { enabled?: boolean })?.enabled };
}

const pageOf = (v: unknown): EditPage => {
  if (!(EDIT_PAGES as readonly string[]).includes(String(v))) throw new PageEditError('INVALID_INPUT', 400, ['page']);
  return v as EditPage;
};
const idOf = (v: unknown): string => {
  if (typeof v !== 'string' || !/^[a-z0-9-]{1,40}$/.test(v) || v.length > ID_MAX) throw new PageEditError('INVALID_INPUT', 400, ['id']);
  return v;
};

export async function sectionView(deps: LookDeps, staffUserId: string, pageRaw: unknown, idRaw: unknown): Promise<SectionView> {
  const page = pageOf(pageRaw);
  const id = idOf(idRaw);
  const [live, row, labels] = await Promise.all([liveValues(deps), findDraft(deps.db, staffUserId), deps.resolver.value('language.labels', { storeId: S })]);
  const draft = draftOf(row?.payload);
  const value = (k: EditKey) => (k in draft.settings ? draft.settings[k] : live[k]);
  const def = sectionDef(page, id, value('layout.blocks'));
  if (!def) throw new PageEditError('not-found', 404);
  const en = shopT('en', labels as LabelOverrides | null);
  const bn = shopT('bn', labels as LabelOverrides | null);
  const fields: FieldView[] = def.fields.map((f) => {
    const v = readField(f, value(f.key));
    const l = readField(f, live[f.key]);
    const view: FieldView = { ...f, value: v, live: l, changed: versionOf(v) !== versionOf(l) };
    if (f.kind === 'label') {
      const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
      view.shown = typeof o.key === 'string' ? { en: en(o.key), bn: bn(o.key) } : { en: String(o.en ?? ''), bn: String(o.bn ?? '') };
    }
    return view;
  });
  return { page, id, locked: def.locked, fields, money: [...def.money, ...pageMoney(page).filter((m) => !def.money.some((x) => x.name === m.name))], more: def.more };
}

export interface PageSections {
  page: EditPage;
  locked: boolean;
  /** The page's sections in order, shown or hidden (a hidden one can be opened and shown again from here). */
  sections: { id: string; on: boolean; name?: string }[];
  money: MoneyLink[];
}

/** The page's sections for the panel's page view ("+": show a hidden section again). */
export async function pageSections(deps: LookDeps, staffUserId: string, pageRaw: unknown): Promise<PageSections> {
  const page = pageOf(pageRaw);
  const [live, row] = await Promise.all([liveValues(deps), findDraft(deps.db, staffUserId)]);
  const draft = draftOf(row?.payload);
  const value = (k: EditKey) => (k in draft.settings ? draft.settings[k] : live[k]);
  const locked = LOCKED_PAGES.includes(page);
  const list = page === 'home' ? 'home.sections' : page === 'category' ? 'layout.category' : page === 'product' ? 'layout.product' : null;
  const sections: PageSections['sections'] = list && !locked ? fullLayout(page as 'home' | 'category' | 'product', value(list) as LayoutRow[]).map((r) => ({ id: r.id, on: r.on })) : [];
  if (page === 'home' || page === 'category') {
    const blocks = Array.isArray(value('layout.blocks')) ? (value('layout.blocks') as Record<string, unknown>[]) : [];
    for (const b of blocks) if (b.page === page && typeof b.id === 'string') sections.push({ id: `lb-${b.id}`, on: b.on === true, name: typeof b.name === 'string' ? b.name : '' });
  }
  return { page, locked, sections, money: pageMoney(page) };
}

// ---- steps ------------------------------------------------------------------------------------------------------------

async function setField(deps: LookDeps, who: EditWho, o: Record<string, unknown>): Promise<SectionView> {
  const staff = who.actor.staffUserId as string;
  const page = pageOf(o.page);
  const id = idOf(o.id);
  const [live, row] = await Promise.all([liveValues(deps), findDraft(deps.db, staff)]);
  const draft = draftOf(row?.payload);
  const value = (k: EditKey) => (k in draft.settings ? draft.settings[k] : live[k]);
  const def = sectionDef(page, id, value('layout.blocks'));
  if (!def || def.locked) throw new PageEditError(def?.locked ? 'LOCKED' : 'not-found', def?.locked ? 409 : 404);
  const f = def.fields.find((x) => x.id === o.field);
  if (!f) throw new PageEditError('INVALID_INPUT', 400, ['field']);
  let next: unknown;
  try {
    next = applyField(f, value(f.key), o.value);
  } catch (e) {
    if (e instanceof EditInputError) throw new PageEditError('INVALID_INPUT', 400, [e.field]);
    throw e;
  }
  const d: EditDraft = { settings: { ...draft.settings }, base: { ...draft.base } };
  if (versionOf(next) === versionOf(live[f.key])) {
    delete d.settings[f.key];
    delete d.base[f.key];
  } else {
    d.settings[f.key] = next;
    d.base[f.key] = d.base[f.key] ?? versionOf(live[f.key]);
  }
  await saveDraft(deps, who, row?.id ?? null, d);
  return sectionView(deps, staff, page, id);
}

async function discard(deps: LookDeps, who: EditWho): Promise<void> {
  const row = await findDraft(deps.db, who.actor.staffUserId as string);
  if (!row) return;
  const keys = Object.keys(draftOf(row.payload).settings);
  await deps.db.layoutSnapshot.update({ where: { id: row.id }, data: { archivedAt: deps.now?.() ?? new Date() } });
  await audit(deps.db, who.actor, { storeId: S, action: 'website.pageEdit.discard', entityType: 'LayoutSnapshot', entityId: row.id, before: { keys } }, who.ctx);
}

export interface PublishDone {
  restoreId: string;
  written: string[];
  /** Settings kept in the draft (their change shows on phones too and the owner answered No). */
  held: EditKey[];
}

interface Checks {
  pass: boolean;
  sizes: number;
  failed: number;
}

const checksOf = (v: unknown): Checks | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.pass !== 'boolean' || typeof o.sizes !== 'number' || typeof o.failed !== 'number') return null;
  return { pass: o.pass, sizes: o.sizes, failed: o.failed };
};

async function publish(deps: LookDeps, who: EditWho, o: Record<string, unknown>): Promise<PublishDone> {
  const staff = who.actor.staffUserId as string;
  const [cfg, live, row] = await Promise.all([deps.resolver.value('shop.pageEdit', { storeId: S }) as Promise<PageEdit>, liveValues(deps), findDraft(deps.db, staff)]);
  const draft = draftOf(row?.payload);
  const keys = Object.keys(draft.settings) as EditKey[];
  if (!row || !keys.length) throw new PageEditError('NOTHING_TO_PUBLISH', 409);
  const stale = keys.filter((k) => draft.base[k] !== versionOf(live[k]));
  if (stale.length) throw new PageEditError('STALE', 409, stale);
  const phone = o.phone === 'yes' || o.phone === 'no' || o.phone === 'phone' ? o.phone : null;
  const checks = checksOf(o.checks);
  const writes: Partial<Record<EditKey, unknown>> = {};
  const held: EditKey[] = [];
  if (cfg.askPhone && phone === null) throw new PageEditError('ASK_PHONE', 409);
  if (cfg.askPhone && phone === 'no') {
    for (const k of keys) {
      const v = desktopOnly(k, live[k], draft.settings[k]);
      if (v === null) held.push(k);
      else if (versionOf(v) !== versionOf(live[k])) writes[k] = v;
    }
  } else {
    // "Yes": only after every phone size passed its checks and the owner said OK.
    if (cfg.askPhone && phone === 'yes' && (!checks?.pass || o.ok !== true)) throw new PageEditError('PHONE_CHECKS_NEEDED', 409);
    for (const k of keys) writes[k] = draft.settings[k];
  }
  if (!Object.keys(writes).length) throw new PageEditError('NOTHING_TO_PUBLISH', 409, held);
  // Through the saved-looks path: the target look is the shop as it is now with the draft's changes.
  const current = await lookNow(deps);
  const target = { ...current, settings: { ...current.settings, ...writes }, auto: { kind: 'edit' as const, of: PUBLISH_NAME } };
  const snap = await deps.db.layoutSnapshot.create({ data: { storeId: S, name: PUBLISH_NAME, payload: target as unknown as Prisma.InputJsonValue, createdById: staff } });
  const lookWho: LookWho = { actor: who.actor, ctx: who.ctx, can: who.can };
  const done = await applyLook(deps, lookWho, snap, { version: lookVersion(current), reason: PUBLISH_NAME, undoOf: null, pause: false });
  // The draft keeps only what stayed back; an empty draft is set aside (kept).
  if (held.length) {
    const rest: EditDraft = { settings: {}, base: {} };
    for (const k of held) {
      rest.settings[k] = draft.settings[k];
      rest.base[k] = draft.base[k];
    }
    await saveDraft(deps, who, row.id, rest);
  } else await deps.db.layoutSnapshot.update({ where: { id: row.id }, data: { archivedAt: deps.now?.() ?? new Date() } });
  await audit(
    deps.db,
    who.actor,
    { storeId: S, action: 'website.pageEdit.publish', entityType: 'LayoutRestore', entityId: done.restoreId, before: { keys }, after: { written: done.written, held, phone, checks: checks ?? undefined, ownerOk: o.ok === true, path: typeof o.path === 'string' ? o.path.slice(0, PATH_MAX) : undefined } },
    who.ctx,
  );
  return { restoreId: done.restoreId, written: done.written, held };
}

async function undo(deps: LookDeps, who: EditWho, o: Record<string, unknown>): Promise<void> {
  const last = await lastPublish(deps, who.actor.staffUserId as string);
  if (!last || last.restoreId !== o.restoreId || !last.canUndo) throw new PageEditError('NOT_ALLOWED', 409, ['newest']);
  const current = await lookNow(deps);
  await lookAction(deps, { actor: who.actor, ctx: who.ctx, can: who.can }, { action: 'undo', restoreId: last.restoreId, version: lookVersion(current) });
}

export const EDIT_ACTIONS = ['page', 'section', 'set', 'discard', 'publish', 'undo'] as const;

/** One step for the bar; answers the bar's state after it (and the section, or what a publish did). */
export async function editAction(deps: LookDeps, who: EditWho, raw: unknown): Promise<{ view: EditView; section?: SectionView; sections?: PageSections; done?: PublishDone }> {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const staff = who.actor.staffUserId as string;
  if (!(EDIT_ACTIONS as readonly string[]).includes(String(o.action))) throw new PageEditError('INVALID_INPUT', 400, ['action']);
  if (o.action === 'page') return { view: await editView(deps, staff), sections: await pageSections(deps, staff, o.page) };
  if (o.action === 'section') return { view: await editView(deps, staff), section: await sectionView(deps, staff, o.page, o.id) };
  if (o.action === 'set') {
    const section = await setField(deps, who, o);
    return { view: await editView(deps, staff), section };
  }
  if (o.action === 'discard') await discard(deps, who);
  if (o.action === 'publish') {
    const done = await publish(deps, who, o);
    return { view: await editView(deps, staff), done };
  }
  if (o.action === 'undo') await undo(deps, who, o);
  return { view: await editView(deps, staff) };
}

/** /api/admin/website/page-edit (see the head of this file). */
export async function pageEditHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: 'website.layout.write', storeId: S });
  if (g instanceof Response) return g;
  const d: LookDeps = { db: deps!.db, resolver: deps!.resolver };
  try {
    const staff = g.actor.staffUserId as string;
    if (!(await isOwner(d.db, staff))) return json({ ok: false, error: 'OWNER_ONLY' }, { status: 403 });
    const cfg = (await d.resolver.value('shop.pageEdit', { storeId: S })) as PageEdit;
    if (!cfg.enabled) return json({ ok: false, error: 'PAGE_EDIT_OFF' }, { status: 409 });
    const who: EditWho = { actor: g.actor, ctx: g.ctx, can: (p) => g.permissions?.has(p as never) ?? false };
    if (method === 'GET') return json({ ok: true, view: await editView(d, staff) });
    return json({ ok: true, ...(await editAction(d, who, b)) });
  } catch (e) {
    if (e instanceof PageEditError) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    if (e instanceof LookError) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

