// S28 · PR 676, 678, 679 (CN-048, admin prototype v5, Rules) — the services of the one-page Rules screen and the pop-up hub:
//
//   hubScreen      every listed setting row with its value, version, On / Off / Sample, and the Smart Rules and links beside it;
//   saveHubRow     one row's fields saved through the setting's own schema (a row that changes what customers pay needs the
//                  owner's OK, `rules.approve`; the page asks for the PIN) — nothing is hardcoded here, the catalogue only names settings;
//   resetHubRow    back to the shipped value;
//   popupsScreen   the twelve system pop-ups and notices with where each shows, who sees it, its state and the owner's words;
//   savePopup      the owner's own words, window and switch for one placement (`rules.hub.popups`).
// Reading needs `rules.read`; saving `rules.write`. Every save is in the audit log with before and after. The Smart Rules engine,
// the coupons and the notices are not touched here: they stay on their own services (PR 208–219).
import { createHash } from 'node:crypto';
import { registry, storeTarget, POPUP_KEYS, popupEntrySchema, type PopupEntry } from '@extas/settings';
import { allow, found, holds, logChange, nowOf, type RulesDeps, type SettingsReader, type Who } from './context';
import { RulesError } from './errors';
import { HUB_ROWS, POPUPS, smartGroupOf, type HubField, type HubGroupId, type HubRow, type HubSettingRow, type PopupSpec } from './hub-catalog';
import { listNotices } from './notices-service';
import { listRules } from './rules-service';
import type { SettingsWriter } from './eid-service';

export interface HubDeps extends RulesDeps {
  settings: SettingsReader & SettingsWriter;
}

type Json = unknown;
type AnySettings = {
  value(key: string, opts?: { storeId?: number }): Promise<Json>;
  set(key: string, value: Json, target: ReturnType<typeof storeTarget>, opts?: { actorId?: string | null; reason?: string | null; ownerApproved?: boolean }): Promise<unknown>;
};
const anySettings = (deps: HubDeps) => deps.settings as unknown as AnySettings;
const specOf = (key: string): { default: Json } | undefined => (registry as unknown as Record<string, { default: Json } | undefined>)[key];

/** A short token of a value: a save made on an older screen is refused (STALE), never merged over. */
export const versionOf = (v: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(v ?? null))
    .digest('hex')
    .slice(0, 16);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The value at a dotted path ('' is the value itself). */
export function getPath(v: unknown, path: string): unknown {
  if (path === '') return v;
  let cur: unknown = v;
  for (const p of path.split('.')) {
    if (!isObj(cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** A copy of `v` with the value at the path replaced ('' replaces all). */
export function setPath(v: unknown, path: string, value: unknown): unknown {
  if (path === '') return value;
  const [head = '', ...rest] = path.split('.');
  const base = isObj(v) ? { ...v } : {};
  base[head] = rest.length ? setPath(base[head], rest.join('.'), value) : value;
  return base;
}

export type HubPill = 'on' | 'off' | 'sample' | 'from';

export interface HubSettingRowView {
  type: 'setting';
  id: string;
  group: HubGroupId;
  key: string;
  fields: readonly HubField[];
  money: boolean;
  more: string | null;
  value: unknown;
  version: string;
  defaultValue: unknown;
  /** Still the shipped value. */
  isDefault: boolean;
  pill: HubPill;
}

export interface HubLinkRowView {
  type: 'link';
  id: string;
  group: HubGroupId;
  href: string;
  /** null: the rule has no switch of its own (a page of settings). */
  pill: 'on' | 'off' | null;
}

export interface HubSmartRowView {
  type: 'smart';
  id: string;
  group: HubGroupId;
  ruleId: string;
  key: string;
  kind: string;
  nameEn: string;
  nameBn: string | null;
  shortEn: string | null;
  shortBn: string | null;
  pill: HubPill;
  startsAt: string | null;
  needsOwnerOk: boolean;
}

export type HubRowView = HubSettingRowView | HubLinkRowView | HubSmartRowView;

export interface HubScreen {
  rows: HubRowView[];
  counts: Record<string, number>;
  /** Rules on with their shipped number: "check these". */
  sample: number;
  /** The newest change made on this page. */
  lastChange: { at: string; rowId: string | null } | null;
}

const hasKey = (key: string) => specOf(key) !== undefined;

function pillOf(row: HubSettingRow, value: unknown, def: unknown): HubPill {
  const on = row.onPath !== undefined ? getPath(value, row.onPath) === true : row.whenSet ? value !== null && value !== undefined : true;
  if (!on) return 'off';
  const isDef = JSON.stringify(value) === JSON.stringify(def);
  // A switch rule that is On with every shipped number: the owner has not looked at it yet. A rule with no switch is On always, so it only says Sample.
  return isDef && row.onPath !== undefined ? 'sample' : 'on';
}

export async function hubScreen(deps: HubDeps, who: Who): Promise<HubScreen> {
  await allow(deps, who, 'rules.read');
  const st = anySettings(deps);
  const rows: HubRowView[] = [];
  for (const row of HUB_ROWS as readonly HubRow[]) {
    if (row.type === 'setting') {
      if (!hasKey(row.key)) continue;
      const [value, def] = [await st.value(row.key, { storeId: who.storeId }), specOf(row.key)!.default];
      rows.push({
        type: 'setting',
        id: row.id,
        group: row.group,
        key: row.key,
        fields: row.fields,
        money: row.money,
        more: row.more ?? null,
        value,
        version: versionOf(value),
        defaultValue: def,
        isDefault: JSON.stringify(value) === JSON.stringify(def),
        pill: pillOf(row, value, def),
      });
    } else {
      if (row.needs && !hasKey(row.needs)) continue;
      let pill: 'on' | 'off' | null = null;
      if (row.onKey && hasKey(row.onKey)) {
        const v = await st.value(row.onKey, { storeId: who.storeId });
        const on = isObj(v) ? v.enabled === true : typeof v === 'boolean' ? v : v !== null && v !== undefined;
        pill = on ? 'on' : 'off';
      }
      rows.push({ type: 'link', id: row.id, group: row.group, href: row.href, pill });
    }
  }
  const { rules } = await listRules(deps, who, {});
  const now = nowOf(deps).toISOString();
  for (const r of rules) {
    if (r.archived || r.broken) continue;
    const future = r.startsAt !== null && r.startsAt > now;
    const pill: HubPill = future ? 'from' : r.live ? 'on' : 'off';
    rows.push({
      type: 'smart',
      id: `rule:${r.id}`,
      group: smartGroupOf(r.kind),
      ruleId: r.id,
      key: r.key,
      kind: r.kind,
      nameEn: r.nameEn,
      nameBn: r.nameBn,
      shortEn: r.short.en,
      shortBn: r.short.bn,
      pill,
      startsAt: r.startsAt,
      needsOwnerOk: r.needsOwnerOk,
    });
  }
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.group] = (counts[r.group] ?? 0) + 1;
  const last = await deps.db.auditLog.findFirst({ where: { storeId: who.storeId, action: 'rules.hub.save' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, entityId: true } });
  return { rows, counts, sample: rows.filter((r) => r.pill === 'sample').length, lastChange: last ? { at: last.createdAt.toISOString(), rowId: last.entityId } : null };
}

const refuse = (e: unknown, what: string): never => {
  const details = (e as { details?: string[] }).details ?? [];
  throw new RulesError('INVALID_INPUT', `the ${what} is not valid`, details.length ? details : [what]);
};

function rowFor(id: string): HubSettingRow {
  const row = (HUB_ROWS as readonly HubRow[]).find((r): r is HubSettingRow => r.type === 'setting' && r.id === id);
  if (!row || !hasKey(row.key)) throw new RulesError('NOT_FOUND', 'no such rule');
  return row;
}

/** A row that changes what customers pay needs the owner's OK. */
async function ownerOk(deps: HubDeps, who: Who, row: HubSettingRow): Promise<boolean> {
  if (!row.money) return false;
  if (!(await holds(deps, who, 'rules.approve'))) throw new RulesError('OWNER_OK_REQUIRED', "this rule changes what customers pay: it needs the owner's OK");
  return true;
}

export interface SaveHubInput {
  id: string;
  /** The version the screen was opened with. */
  version: string;
  /** The new value of each field being changed, by path. */
  values: Record<string, unknown>;
}

export async function saveHubRow(deps: HubDeps, who: Who, input: SaveHubInput): Promise<{ id: string; value: unknown; version: string }> {
  await allow(deps, who, 'rules.write');
  const row = rowFor(input.id);
  const st = anySettings(deps);
  const before = await st.value(row.key, { storeId: who.storeId });
  if (versionOf(before) !== input.version) throw new RulesError('STALE_DRAFT', 'someone changed this rule since you opened it');
  const allowed = new Set(row.fields.map((f) => f.path));
  let next: unknown = before;
  for (const [path, v] of Object.entries(input.values)) {
    if (!allowed.has(path)) throw new RulesError('INVALID_INPUT', 'a field is not part of this rule', [path]);
    next = setPath(next, path, v);
  }
  if (JSON.stringify(next) === JSON.stringify(before)) return { id: row.id, value: before, version: versionOf(before) };
  const approved = await ownerOk(deps, who, row);
  try {
    await st.set(row.key, next, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Rules', ...(approved ? { ownerApproved: true } : {}) });
  } catch (e) {
    refuse(e, row.id);
  }
  await logChange(deps.db, who, { action: 'rules.hub.save', entityType: 'HubRule', entityId: row.id, before, after: next });
  return { id: row.id, value: next, version: versionOf(next) };
}

export async function resetHubRow(deps: HubDeps, who: Who, input: { id: string; version: string }): Promise<{ id: string; value: unknown; version: string }> {
  await allow(deps, who, 'rules.write');
  const row = rowFor(input.id);
  const st = anySettings(deps);
  const before = await st.value(row.key, { storeId: who.storeId });
  if (versionOf(before) !== input.version) throw new RulesError('STALE_DRAFT', 'someone changed this rule since you opened it');
  const def = specOf(row.key)!.default;
  if (JSON.stringify(before) === JSON.stringify(def)) return { id: row.id, value: before, version: versionOf(before) };
  const approved = await ownerOk(deps, who, row);
  try {
    await st.set(row.key, def, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Rules: back to the shipped value', ...(approved ? { ownerApproved: true } : {}) });
  } catch (e) {
    refuse(e, row.id);
  }
  await logChange(deps.db, who, { action: 'rules.hub.reset', entityType: 'HubRule', entityId: row.id, before, after: def });
  return { id: row.id, value: def, version: versionOf(def) };
}

// ------------------------------------------------------------------------------------------------ pop-ups and notices

export type PopupState = 'on' | 'off' | 'scheduled' | 'ended' | 'waiting';

export interface PopupView {
  n: number;
  key: string;
  group: PopupSpec['group'];
  page: PopupSpec['page'];
  shape: PopupSpec['shape'];
  tokens: readonly string[];
  hasN: boolean;
  managed: { href: string } | null;
  /** The notice engine carries it (the owner's notices below); its words are written there. */
  notice: 'bar' | 'popup' | null;
  /** The other feature it needs, and whether that is on. */
  needs: { href: string; on: boolean } | null;
  state: PopupState;
  entry: PopupEntry;
}

export interface PopupsScreen {
  popups: PopupView[];
  version: string;
  today: string;
}

const EMPTY_ENTRY: PopupEntry = { on: false, textEn: '', textBn: '', from: null, to: null, n: null };

async function isOn(st: AnySettings, storeId: number, key: string | undefined, field?: string): Promise<boolean | null> {
  if (!key || !hasKey(key)) return null;
  const v = await st.value(key, { storeId });
  if (field) return isObj(v) ? v[field] === true : false;
  if (isObj(v)) return v.enabled === true;
  return typeof v === 'boolean' ? v : v !== null && v !== undefined;
}

export function popupState(entryOn: boolean, from: string | null, to: string | null, today: string, engineOn: boolean | null, waiting: boolean): PopupState {
  if (waiting) return 'waiting';
  const on = engineOn ?? entryOn;
  if (!on) return 'off';
  if (from && from > today) return 'scheduled';
  if (to && to < today) return 'ended';
  return 'on';
}

export async function popupsScreen(deps: HubDeps, who: Who): Promise<PopupsScreen> {
  await allow(deps, who, 'rules.read');
  const st = anySettings(deps);
  const stored = ((await st.value('rules.hub.popups', { storeId: who.storeId })) ?? {}) as Record<string, PopupEntry>;
  const notices = await listNotices(deps, who, { includeArchived: false });
  const today = nowOf(deps).toISOString().slice(0, 10);
  const popups: PopupView[] = [];
  for (const p of POPUPS) {
    const entry = { ...EMPTY_ENTRY, ...(stored[p.key] ?? {}) };
    let engineOn: boolean | null = null;
    if (p.notice) engineOn = notices.some((n) => n.kind === (p.notice === 'bar' ? 'bar' : 'popup') && n.enabled);
    else if (p.managed) engineOn = await isOn(st, who.storeId, p.managed.onKey, p.managed.onField);
    let needs: PopupView['needs'] = null;
    if (p.needs) needs = { href: p.needs.href, on: (await isOn(st, who.storeId, p.needs.onKey, p.needs.onField)) === true };
    let state = popupState(entry.on, entry.from, entry.to, today, engineOn, p.waiting === true);
    if (needs && !needs.on && state === 'on') state = 'off';
    popups.push({
      n: p.n,
      key: p.key,
      group: p.group,
      page: p.page,
      shape: p.shape,
      tokens: p.tokens,
      hasN: p.hasN === true,
      managed: p.managed ? { href: p.managed.href } : null,
      notice: p.notice ?? null,
      needs,
      state,
      entry,
    });
  }
  return { popups, version: versionOf(stored), today };
}

export async function savePopup(deps: HubDeps, who: Who, input: { key: string; entry: unknown; version: string }): Promise<PopupsScreen> {
  await allow(deps, who, 'rules.write');
  const spec = found(
    POPUPS.find((p) => p.key === input.key),
    'pop-up',
  );
  if (spec.waiting || spec.notice) throw new RulesError('INVALID_INPUT', 'this placement is written elsewhere', [spec.key]);
  if (!(POPUP_KEYS as readonly string[]).includes(spec.key)) throw new RulesError('NOT_FOUND', 'no such placement');
  const entry = popupEntrySchema.safeParse(input.entry);
  if (!entry.success)
    throw new RulesError(
      'INVALID_INPUT',
      'the pop-up is not valid',
      entry.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`),
    );
  if (entry.data.n !== null && !spec.hasN) throw new RulesError('INVALID_INPUT', 'this placement has no number', ['n']);
  const st = anySettings(deps);
  const before = ((await st.value('rules.hub.popups', { storeId: who.storeId })) ?? {}) as Record<string, PopupEntry>;
  if (versionOf(before) !== input.version) throw new RulesError('STALE_DRAFT', 'someone changed the pop-ups since you opened them');
  const next = { ...before, [spec.key]: entry.data };
  try {
    await st.set('rules.hub.popups', next, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Rules › Pop-ups & notices' });
  } catch (e) {
    refuse(e, spec.key);
  }
  await logChange(deps.db, who, { action: 'rules.hub.popup', entityType: 'HubPopup', entityId: spec.key, before: before[spec.key] ?? null, after: entry.data });
  return popupsScreen(deps, who);
}
