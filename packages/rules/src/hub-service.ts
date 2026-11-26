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
import { SYSTEM } from '@extas/auth';
import { registry, storeTarget, POPUP_KEYS, popupEntrySchema, type HubScheduleEntry, type PopupEntry } from '@extas/settings';
import { scheduleDateProblem, splitDue, withEntry } from './hub-schedule';
import { allow, found, holds, logChange, nowOf, textContext, type RulesDeps, type SettingsReader, type Who } from './context';
import { langContext, loadRules, othersByKey } from './core';
import { render, ruleLookup } from './text';
import { RulesError } from './errors';
import { HUB_ROWS, POPUPS, smartGroupOf, type HubField, type HubGroupId, type HubRow, type HubSettingRow, type PopupSpec } from './hub-catalog';
import { isTryable, tryRow, TRY_DAYS, type TryOrder, type TryResult } from './hub-try';
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
  /** PR 858: a change waiting for its day ("Start on a later date"), or null. */
  scheduled: { from: string; values: Record<string, unknown> } | null;
  /** PR 867: the owner's own customer wording for this rule ("Edit the customer text"), or null while the automatic words are used. */
  text: { bn: string; en: string } | null;
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
  // PR 858: a change whose day has come is put in first, so the screen shows what the shop uses now
  await applyDueHubSchedules(deps, { storeId: who.storeId });
  const waiting = await readSchedule(deps, who.storeId);
  const texts = await readTexts(deps, who.storeId);
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
        scheduled: ((e) => (e ? { from: e.from, values: e.values } : null))(waiting.find((x) => x.rowId === row.id)),
        text: texts[row.id] ?? null,
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
  // PR 1231: a Smart Rule's short line is shown filled with its own values ({windowHours} → 72), as the shop shows it; a value
  // that is not set stays a token and the page writes "not set" there
  const [stored, tctx] = await Promise.all([loadRules(deps.db, who.storeId), textContext(deps, who.storeId)]);
  const others = othersByKey(stored.rules);
  const fill = (id: string, text: string | null, lang: 'en' | 'bn'): string | null => {
    const rule = stored.rules.find((x) => x.id === id);
    return text && rule ? render(text, ruleLookup(rule, { others }), langContext(tctx, lang)).text : text;
  };
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
      shortEn: fill(r.id, r.short.en, 'en'),
      shortBn: fill(r.id, r.short.bn, 'bn'),
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

/**
 * "Try on last 30 days' orders" (prototype Rules › More options): the typed, unsaved numbers of a row counted against the shop's own
 * orders of the last days, set beside the saved numbers. Read only: nothing is saved, nothing is sent, no order changes
 * (`rules.read`). Only the rows named in `TRYABLE_ROWS` can be tried.
 */
export async function tryHubRow(deps: HubDeps, who: Who, input: { id: string; values: Record<string, unknown> }): Promise<TryResult> {
  await allow(deps, who, 'rules.read');
  const row = rowFor(input.id);
  if (!isTryable(row.id)) throw new RulesError('NOT_FOUND', 'this rule cannot be tried on past orders');
  const allowed = new Set(row.fields.map((f) => f.path));
  for (const path of Object.keys(input.values)) if (!allowed.has(path)) throw new RulesError('INVALID_INPUT', 'a field is not part of this rule', [path]);
  const saved = await anySettings(deps).value(row.key, { storeId: who.storeId });
  const since = new Date(nowOf(deps).getTime() - TRY_DAYS * 86_400_000); // hardcode-ok: ms in a day
  const rows = await deps.db.order.findMany({
    where: { storeId: who.storeId, createdAt: { gte: since }, status: { notIn: ['DRAFT', 'CANCELLED'] } },
    select: { subtotalMinor: true, discountMinor: true, deliveryChargeMinor: true, phone: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 20_000, // hardcode-ok: a safety cap on one read
  });
  const orders: TryOrder[] = rows.map((o) => ({ goodsMinor: o.subtotalMinor - o.discountMinor, chargeMinor: o.deliveryChargeMinor, phone: o.phone, at: o.createdAt }));
  return tryRow(row.id, saved, input.values, orders);
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
  /** Where its numbers are set; `engine` when that engine's own switch decides whether it shows (the row has no switch of its own). */
  managed: { href: string; engine: boolean } | null;
  /** PR 1200: set wholly in the engine it is managed in (Demo products): no switch and no editor here, "See" instead. */
  readOnly: boolean;
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
      managed: p.managed ? { href: p.managed.href, engine: !!p.managed.onKey } : null,
      readOnly: p.readOnly === true,
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
  if (spec.waiting || spec.readOnly || spec.notice) throw new RulesError('INVALID_INPUT', 'this placement is written elsewhere', [spec.key]);
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

/** PR 949: one past state of a pop-up placement: what it held until `at`. */
export interface PopupHistoryEntry {
  changeId: string;
  /** The entry the change replaced; null: the placement had no entry (the shop's own wording). */
  entry: PopupEntry | null;
  at: string;
  by: string | null;
}

/** The last changes of one pop-up placement, newest first (`rules.read`): the entry each one replaced, when, and by whom. Nothing is changed. */
export async function popupHistory(deps: HubDeps, who: Who, input: { key: string }): Promise<PopupHistoryEntry[]> {
  await allow(deps, who, 'rules.read');
  if (!(POPUP_KEYS as readonly string[]).includes(input.key)) throw new RulesError('NOT_FOUND', 'no such placement');
  const changes = await deps.db.settingChange.findMany({
    where: { key: 'rules.hub.popups', storeId: who.storeId, action: { in: ['SET', 'RESET_TO_DEFAULT'] } },
    orderBy: { createdAt: 'desc' },
    take: 60, // hardcode-ok: the newest changes of all twelve placements, read to find this one's last few
    select: { id: true, oldValue: true, newValue: true, createdAt: true, actorId: true },
  });
  const at = (v: unknown): PopupEntry | null => (isObj(v) && isObj(v[input.key]) ? (v[input.key] as unknown as PopupEntry) : null);
  const kept = changes.filter((c) => JSON.stringify(at(c.oldValue)) !== JSON.stringify(at(c.newValue))).slice(0, HISTORY_SHOWN);
  const ids = [...new Set(kept.flatMap((c) => (c.actorId ? [c.actorId] : [])))];
  const people = ids.length ? await deps.db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : [];
  const name = new Map(people.map((p) => [p.id, p.displayName]));
  return kept.map((c) => ({ changeId: c.id, entry: at(c.oldValue), at: c.createdAt.toISOString(), by: c.actorId ? (name.get(c.actorId) ?? null) : null }));
}

/** "Undo to this" for a pop-up: the placement goes back to what a past change replaced. A new change on top; the history keeps every step. */
export async function undoPopup(deps: HubDeps, who: Who, input: { key: string; changeId: string; version: string }): Promise<PopupsScreen> {
  await allow(deps, who, 'rules.write');
  const spec = found(
    POPUPS.find((p) => p.key === input.key),
    'pop-up',
  );
  if (spec.waiting || spec.readOnly || spec.notice) throw new RulesError('INVALID_INPUT', 'this placement is written elsewhere', [spec.key]);
  const st = anySettings(deps);
  const before = ((await st.value('rules.hub.popups', { storeId: who.storeId })) ?? {}) as Record<string, PopupEntry>;
  if (versionOf(before) !== input.version) throw new RulesError('STALE_DRAFT', 'someone changed the pop-ups since you opened them');
  const change = await deps.db.settingChange.findFirst({ where: { id: input.changeId, key: 'rules.hub.popups', storeId: who.storeId }, select: { oldValue: true } });
  if (!change) throw new RulesError('NOT_FOUND', 'no such earlier value');
  const old = isObj(change.oldValue) && isObj(change.oldValue[spec.key]) ? (change.oldValue[spec.key] as unknown as PopupEntry) : null;
  const next: Record<string, PopupEntry> = { ...before };
  if (old) next[spec.key] = old;
  else delete next[spec.key];
  try {
    await st.set('rules.hub.popups', next, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Rules › Pop-ups & notices: undo to an earlier value' });
  } catch (e) {
    refuse(e, spec.key);
  }
  await logChange(deps.db, who, { action: 'rules.hub.popup', entityType: 'HubPopup', entityId: spec.key, before: before[spec.key] ?? null, after: old });
  return popupsScreen(deps, who);
}

// ------------------------------------------------------------------------------------------------ "Start on a later date" (PR 858)

const SCHEDULE_KEY = 'rules.hub.schedule';

async function readSchedule(deps: HubDeps, storeId: number): Promise<HubScheduleEntry[]> {
  if (!hasKey(SCHEDULE_KEY)) return [];
  const v = await anySettings(deps).value(SCHEDULE_KEY, { storeId });
  return isObj(v) && Array.isArray(v.entries) ? (v.entries as HubScheduleEntry[]) : [];
}

async function writeSchedule(deps: HubDeps, who: Who, entries: HubScheduleEntry[], reason: string, approved: boolean): Promise<void> {
  await anySettings(deps).set(SCHEDULE_KEY, { entries }, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason, ...(approved ? { ownerApproved: true } : {}) });
}

const todayOf = (deps: HubDeps) => nowOf(deps).toISOString().slice(0, 10); // hardcode-ok: ISO date

/**
 * Schedules a row's typed numbers to start on `from` (a day after today). Same rights as saving: `rules.write`, and a money row needs
 * the owner's OK now (the PIN is checked by the route). Nothing changes today; one row has one scheduled change (a new one replaces it).
 */
export async function scheduleHubRow(deps: HubDeps, who: Who, input: { id: string; version: string; values: Record<string, unknown>; from: unknown }): Promise<{ id: string; from: string }> {
  await allow(deps, who, 'rules.write');
  const row = rowFor(input.id);
  const problem = scheduleDateProblem(input.from, todayOf(deps));
  if (problem) throw new RulesError('INVALID_INPUT', 'the start date is not valid', [`from:${problem}`]);
  const from = input.from as string;
  const st = anySettings(deps);
  const before = await st.value(row.key, { storeId: who.storeId });
  if (versionOf(before) !== input.version) throw new RulesError('STALE_DRAFT', 'someone changed this rule since you opened it');
  const allowed = new Set(row.fields.map((f) => f.path));
  let next: unknown = before;
  for (const [path, v] of Object.entries(input.values)) {
    if (!allowed.has(path)) throw new RulesError('INVALID_INPUT', 'a field is not part of this rule', [path]);
    next = setPath(next, path, v);
  }
  if (JSON.stringify(next) === JSON.stringify(before)) throw new RulesError('INVALID_INPUT', 'nothing changed', ['values']);
  const schema = (registry as unknown as Record<string, { schema: { safeParse(v: unknown): { success: boolean } } } | undefined>)[row.key]?.schema;
  if (schema && !schema.safeParse(next).success) throw new RulesError('INVALID_INPUT', 'the numbers are not valid', [row.id]);
  const approved = await ownerOk(deps, who, row);
  const entry: HubScheduleEntry = { rowId: row.id, from, values: input.values, by: who.actor.staffUserId ?? null, at: nowOf(deps).toISOString() };
  await writeSchedule(deps, who, withEntry(await readSchedule(deps, who.storeId), row.id, entry), 'Rules: scheduled a change', approved);
  await logChange(deps.db, who, { action: 'rules.hub.schedule', entityType: 'HubRule', entityId: row.id, before: null, after: { from, values: input.values } });
  return { id: row.id, from };
}

/** Cancels a row's scheduled change (the rule stays as it is). Money rows need the owner's OK, as scheduling did. */
export async function cancelHubSchedule(deps: HubDeps, who: Who, input: { id: string }): Promise<{ id: string }> {
  await allow(deps, who, 'rules.write');
  const row = rowFor(input.id);
  const now = await readSchedule(deps, who.storeId);
  const had = now.find((e) => e.rowId === row.id);
  if (!had) throw new RulesError('NOT_FOUND', 'nothing is scheduled for this rule');
  const approved = await ownerOk(deps, who, row);
  await writeSchedule(deps, who, withEntry(now, row.id, null), 'Rules: cancelled a scheduled change', approved);
  await logChange(deps.db, who, { action: 'rules.hub.schedule.cancel', entityType: 'HubRule', entityId: row.id, before: { from: had.from, values: had.values }, after: null });
  return { id: row.id };
}

/**
 * Puts in every scheduled change whose day has come (the rules clock, and each time the Rules screen opens). Written in the system's name,
 * with the OK the owner gave when scheduling; a change that no longer fits the rule is dropped and logged, never forced.
 */
export async function applyDueHubSchedules(deps: HubDeps, opts: { storeId: number }): Promise<{ applied: number; dropped: number }> {
  const entries = await readSchedule(deps, opts.storeId);
  const { due, waiting } = splitDue(entries, todayOf(deps));
  if (!due.length) return { applied: 0, dropped: 0 };
  const who: Who = { actor: SYSTEM, storeId: opts.storeId, ctx: { source: 'job' } };
  const st = anySettings(deps);
  let applied = 0;
  let dropped = 0;
  for (const e of due) {
    const row = (HUB_ROWS as readonly HubRow[]).find((r): r is HubSettingRow => r.type === 'setting' && r.id === e.rowId);
    if (!row || !hasKey(row.key)) {
      dropped++;
      continue;
    }
    const before = await st.value(row.key, { storeId: opts.storeId });
    let next: unknown = before;
    for (const [path, v] of Object.entries(e.values)) next = setPath(next, path, v);
    try {
      await st.set(row.key, next, storeTarget(opts.storeId), { actorId: null, reason: 'Rules: scheduled change started', ...(row.money ? { ownerApproved: true } : {}) });
      await logChange(deps.db, who, { action: 'rules.hub.schedule.start', entityType: 'HubRule', entityId: row.id, before, after: next });
      applied++;
    } catch {
      await logChange(deps.db, who, { action: 'rules.hub.schedule.dropped', entityType: 'HubRule', entityId: row.id, before: { from: e.from, values: e.values }, after: null });
      dropped++;
    }
  }
  await st.set(SCHEDULE_KEY, { entries: waiting }, storeTarget(opts.storeId), { actorId: null, reason: 'Rules: scheduled changes started', ownerApproved: true });
  return { applied, dropped };
}

// ------------------------------------------------------------------------------------------------ "Edit the customer text" and "History" (PR 867)

const TEXT_KEY = 'rules.hub.text';
export interface HubCustomerText {
  bn: string;
  en: string;
}

async function readTexts(deps: HubDeps, storeId: number): Promise<Record<string, HubCustomerText>> {
  if (!hasKey(TEXT_KEY)) return {};
  const v = await anySettings(deps).value(TEXT_KEY, { storeId });
  return isObj(v) && isObj(v.texts) ? (v.texts as Record<string, HubCustomerText>) : {};
}

/**
 * Saves the owner's own customer wording for a rule row (Bengali and English), or, with `text: null`, goes back to the automatic words.
 * It is wording only: no number or switch of the rule changes, so no PIN. `rules.write`; audited; the entry replaces the old one, and the
 * setting history keeps every earlier wording.
 */
export async function saveHubText(deps: HubDeps, who: Who, input: { id: string; text: { bn: unknown; en: unknown } | null }): Promise<{ id: string; text: HubCustomerText | null }> {
  await allow(deps, who, 'rules.write');
  const row = rowFor(input.id);
  if (!hasKey(TEXT_KEY)) throw new RulesError('NOT_FOUND', 'the customer wording is not available');
  const all = await readTexts(deps, who.storeId);
  const before = all[row.id] ?? null;
  const next = { ...all };
  if (input.text === null) delete next[row.id];
  else {
    const bn = typeof input.text.bn === 'string' ? input.text.bn.trim() : '';
    const en = typeof input.text.en === 'string' ? input.text.en.trim() : '';
    if (!bn || !en) throw new RulesError('INVALID_INPUT', 'write the words in Bengali and in English', [!bn ? 'bn' : 'en']);
    next[row.id] = { bn, en };
  }
  if (JSON.stringify(next) === JSON.stringify(all)) return { id: row.id, text: before };
  try {
    await anySettings(deps).set(TEXT_KEY, { texts: next }, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Rules: customer wording' });
  } catch (e) {
    refuse(e, 'customer wording');
  }
  await logChange(deps.db, who, { action: 'rules.hub.text', entityType: 'HubRule', entityId: row.id, before, after: next[row.id] ?? null });
  return { id: row.id, text: next[row.id] ?? null };
}

export interface HubHistoryEntry {
  /** The id to undo to. */
  changeId: string;
  /** What the rule held until `at` (the value this change replaced). */
  value: unknown;
  at: string;
  by: string | null;
}

const HISTORY_SHOWN = 6; // hardcode-ok: the prototype lists the last six changes

/** The last changes of a row's setting, newest first: the value each one replaced, when, and by whom (`rules.read`). Nothing is changed. */
export async function hubHistory(deps: HubDeps, who: Who, input: { id: string }): Promise<HubHistoryEntry[]> {
  await allow(deps, who, 'rules.read');
  const row = rowFor(input.id);
  const def = specOf(row.key)!.default;
  const changes = await deps.db.settingChange.findMany({
    where: { key: row.key, storeId: who.storeId, action: { in: ['SET', 'RESET_TO_DEFAULT'] } },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_SHOWN * 3, // hardcode-ok: a few more than shown, so a change that did not move the value can be skipped
    select: { id: true, oldValue: true, newValue: true, createdAt: true, actorId: true },
  });
  const kept = changes.filter((c) => JSON.stringify(c.oldValue ?? def) !== JSON.stringify(c.newValue ?? def)).slice(0, HISTORY_SHOWN);
  const ids = [...new Set(kept.flatMap((c) => (c.actorId ? [c.actorId] : [])))];
  const people = ids.length ? await deps.db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : [];
  const name = new Map(people.map((p) => [p.id, p.displayName]));
  return kept.map((c) => ({ changeId: c.id, value: c.oldValue ?? def, at: c.createdAt.toISOString(), by: c.actorId ? (name.get(c.actorId) ?? null) : null }));
}

/**
 * "Undo to this": the rule goes back to the value a past change replaced. It is a new change on top (the history keeps every step, nothing is
 * deleted), checked by the setting's own schema like any save; a row that changes what customers pay needs the owner's OK (the route asks for the PIN).
 */
export async function undoHubRow(deps: HubDeps, who: Who, input: { id: string; changeId: string; version: string }): Promise<{ id: string; value: unknown; version: string }> {
  await allow(deps, who, 'rules.write');
  const row = rowFor(input.id);
  const st = anySettings(deps);
  const before = await st.value(row.key, { storeId: who.storeId });
  if (versionOf(before) !== input.version) throw new RulesError('STALE_DRAFT', 'someone changed this rule since you opened it');
  const change = await deps.db.settingChange.findFirst({ where: { id: input.changeId, key: row.key, storeId: who.storeId }, select: { oldValue: true } });
  if (!change) throw new RulesError('NOT_FOUND', 'no such earlier value');
  const next = change.oldValue ?? specOf(row.key)!.default;
  if (JSON.stringify(next) === JSON.stringify(before)) return { id: row.id, value: before, version: versionOf(before) };
  const approved = await ownerOk(deps, who, row);
  try {
    await st.set(row.key, next, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Rules: undo to an earlier value', ...(approved ? { ownerApproved: true } : {}) });
  } catch (e) {
    refuse(e, row.id);
  }
  await logChange(deps.db, who, { action: 'rules.hub.undo', entityType: 'HubRule', entityId: row.id, before, after: next });
  return { id: row.id, value: next, version: versionOf(next) };
}
