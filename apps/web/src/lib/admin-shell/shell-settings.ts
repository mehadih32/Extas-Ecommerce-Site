// PR 495 (12) follow-up 205 (CN-018) — Settings › More › Start & search (/admin/settings/shell): the screens for the three
// admin-shell settings that were set only through `settings cli.ts set` (packages/settings/src/registry-admin-shell.ts):
//   - `admin.startPages`   the page each role opens on after sign-in (one choice per role; the Dashboard = no entry)
//   - `admin.shell`        badge freshness and the search palette's limits; and, as two Lumen switch cards, follow-up
//                          209's `recentPages` (0 = off) and `keyJumps` (off) — both off as shipped
//   - `admin.dashboard`    the Dashboard's date choices, the greeting's hours and the small line's days
//
//   GET  /api/admin/settings/shell   the page's cards with their versions (`settings.read`)
//   PUT  /api/admin/settings/shell   {key, value, version}  one card saved whole (FieldsCard); a card changed by someone
//                                    else in between is STALE
//                                    {key: 'recentPages'|'keyJumps', on, values}  one switch card (Lumen SettingCards)
//                                    Both need `settings.write`; written through the settings resolver with the person as
//                                    actor (the change log) and audited `settings.adminShell.save`.
// Nothing here changes money, an order or a customer: it is how the admin opens and searches. A role key that is no
// longer in the role list keeps its stored start page (nothing is dropped behind the owner's back).
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { ADMIN_SECTIONS, adminDashboardSchema, adminShellSchema, adminStartPagesSchema, storeTarget, type AdminSectionId } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { RECENT_KEPT } from './shortcuts';

const S = MOTHER_STORE_ID;

/** The FieldsCard cards of the page (each saved whole with its version). */
export const SHELL_CARD_KEYS = ['admin.startPages', 'admin.shell', 'admin.dashboard'] as const;
export type ShellCardKey = (typeof SHELL_CARD_KEYS)[number];
/** The Lumen switch cards (follow-up 209's options), saved with {key, on, values}. */
export const SHELL_SWITCH_KEYS = ['recentPages', 'keyJumps'] as const;
export type ShellSwitchKey = (typeof SHELL_SWITCH_KEYS)[number];

/** The sections a role may start on. AI Center stays out while its stage is closed (CN-036); a stored one is kept. */
export const START_SECTIONS: readonly AdminSectionId[] = ADMIN_SECTIONS.filter((s) => s !== 'ai');

type ShellValue = { badgeCacheSeconds: number; searchPerGroup: number; searchMinChars: number; recentPages: number; keyJumps: boolean };
type DashValue = { ranges: number[]; afternoonHour: number; eveningHour: number; sparkDays: number };
type Json = Record<string, unknown>;

export interface ShellRoleOption {
  key: string;
  nameEn: string;
  nameBn: string;
}

export interface ShellCard {
  key: ShellCardKey;
  value: Json;
  version: string;
}

export interface ShellScreen {
  cards: Record<ShellCardKey, ShellCard>;
  switches: { recentPages: { on: boolean; count: number }; keyJumps: { on: boolean } };
  roles: ShellRoleOption[];
}

export class ShellSettingsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}

interface Who {
  actor: Actor;
  ctx: RequestContext;
}
type Deps = Pick<AdminDeps, 'db' | 'resolver'>;

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

/** The start-page card: every listed role with its start section ('dashboard' when it has none). */
export function startCardOf(stored: Record<string, string>, roles: readonly { key: string }[]): Json {
  return Object.fromEntries(roles.map((r) => [r.key, stored[r.key] ?? 'dashboard']));
}

/** Back to `admin.startPages`: listed roles on the Dashboard need no entry; roles not listed keep what they had. */
export function startPagesFrom(card: Json, stored: Record<string, string>, roles: readonly { key: string }[]): Record<string, string> {
  const listed = new Set(roles.map((r) => r.key));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(stored)) if (!listed.has(k)) out[k] = v;
  for (const r of roles) {
    const v = card[r.key] ?? stored[r.key] ?? 'dashboard';
    if (v !== 'dashboard') out[r.key] = String(v);
  }
  return out;
}

/** The search card: the three numbers of `admin.shell` (the two switches have their own cards). */
export function searchCardOf(v: ShellValue): Json {
  return { badgeCacheSeconds: v.badgeCacheSeconds, searchPerGroup: v.searchPerGroup, searchMinChars: v.searchMinChars };
}

/** The Dashboard card: the date choices as rows (one number each) for the FieldsCard's list. */
export function dashCardOf(v: DashValue): Json {
  return { ranges: v.ranges.map((days) => ({ days })), afternoonHour: v.afternoonHour, eveningHour: v.eveningHour, sparkDays: v.sparkDays };
}

export function dashFrom(card: Json): Json {
  const rows = Array.isArray(card.ranges) ? (card.ranges as unknown[]) : [];
  return { ...card, ranges: rows.map((r) => (isObj(r) ? r.days : r)) };
}

/** A switch card's next `admin.shell`: recent pages on = the count (1–10), off = 0; key jumps on or off. */
export function shellWithSwitch(cur: ShellValue, key: ShellSwitchKey, on: boolean, values: Json): ShellValue {
  if (key === 'keyJumps') return { ...cur, keyJumps: on };
  const raw = Number(values.count);
  const count = Number.isInteger(raw) ? Math.min(RECENT_KEPT, Math.max(1, raw)) : RECENT_KEPT;
  return { ...cur, recentPages: on ? count : 0 };
}

const issuesOf = (issues: readonly { path: readonly PropertyKey[] }[]) => [...new Set(issues.map((i) => String(i.path[0] ?? 'value')))];

async function rolesOf(deps: Deps): Promise<ShellRoleOption[]> {
  return deps.db.role.findMany({ where: { archivedAt: null }, select: { key: true, nameEn: true, nameBn: true }, orderBy: [{ isSystem: 'desc' }, { nameEn: 'asc' }] });
}

/** The page: its three cards with versions, the two switch cards and the role list (`settings.read`). */
export async function shellScreen(deps: Deps, who: Who): Promise<ShellScreen> {
  await requirePermission(deps.db, who.actor, 'settings.read', { storeId: S });
  const [start, shell, dash, roles] = await Promise.all([
    deps.resolver.value('admin.startPages', { storeId: S }) as Promise<Record<string, string>>,
    deps.resolver.value('admin.shell', { storeId: S }) as Promise<ShellValue>,
    deps.resolver.value('admin.dashboard', { storeId: S }) as Promise<DashValue>,
    rolesOf(deps),
  ]);
  const card = (key: ShellCardKey, value: Json): ShellCard => ({ key, value, version: versionOf(value) });
  const recent = shell.recentPages ?? 0;
  return {
    cards: {
      'admin.startPages': card('admin.startPages', startCardOf(start, roles)),
      'admin.shell': card('admin.shell', searchCardOf(shell)),
      'admin.dashboard': card('admin.dashboard', dashCardOf(dash)),
    },
    switches: { recentPages: { on: recent > 0, count: recent > 0 ? recent : RECENT_KEPT }, keyJumps: { on: shell.keyJumps === true } },
    roles,
  };
}

async function write(deps: Deps, who: Who, key: ShellCardKey, before: unknown, after: unknown, reason: string) {
  if (versionOf(before) === versionOf(after)) return;
  await deps.resolver.set(key, after as never, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason });
  await audit(deps.db, who.actor, { storeId: S, action: 'settings.adminShell.save', entityType: 'Setting', entityId: key, before: { value: before } as never, after: { value: after } as never }, who.ctx);
}

/** One card or switch saved (`settings.write`); answers the page again. */
export async function saveShellSetting(deps: Deps, who: Who, input: unknown): Promise<ShellScreen> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input) || typeof input.key !== 'string') throw new ShellSettingsError('INVALID_INPUT', 400, ['key']);
  const { key } = input;
  const reason = 'Settings › More › Start & search';
  if ((SHELL_SWITCH_KEYS as readonly string[]).includes(key)) {
    if (typeof input.on !== 'boolean') throw new ShellSettingsError('INVALID_INPUT', 400, ['on']);
    const cur = (await deps.resolver.value('admin.shell', { storeId: S })) as ShellValue;
    const next = adminShellSchema.parse(shellWithSwitch(cur, key as ShellSwitchKey, input.on, isObj(input.values) ? input.values : {}));
    await write(deps, who, 'admin.shell', cur, next, `${reason} › ${key}`);
    return shellScreen(deps, who);
  }
  if (!(SHELL_CARD_KEYS as readonly string[]).includes(key)) throw new ShellSettingsError('INVALID_INPUT', 400, ['key']);
  if (!isObj(input.value)) throw new ShellSettingsError('INVALID_INPUT', 400, ['value']);
  const screen = await shellScreen(deps, who);
  const k = key as ShellCardKey;
  if (input.version !== screen.cards[k].version) throw new ShellSettingsError('STALE', 409);
  const value = input.value;
  if (k === 'admin.startPages') {
    const stored = (await deps.resolver.value('admin.startPages', { storeId: S })) as Record<string, string>;
    const listed = new Set(screen.roles.map((r) => r.key));
    const bad = Object.entries(value).filter(([r, v]) => !listed.has(r) || (v !== 'dashboard' && !(START_SECTIONS as readonly string[]).includes(String(v)) && stored[r] !== v));
    if (bad.length) throw new ShellSettingsError('INVALID_INPUT', 400, bad.map(([r]) => r));
    const ok = adminStartPagesSchema.safeParse(startPagesFrom(value, stored, screen.roles));
    if (!ok.success) throw new ShellSettingsError('INVALID_INPUT', 400, issuesOf(ok.error.issues));
    await write(deps, who, k, stored, ok.data, reason);
  } else if (k === 'admin.shell') {
    const cur = (await deps.resolver.value('admin.shell', { storeId: S })) as ShellValue;
    const extra = Object.keys(value).filter((f) => !['badgeCacheSeconds', 'searchPerGroup', 'searchMinChars'].includes(f));
    if (extra.length) throw new ShellSettingsError('INVALID_INPUT', 400, extra);
    const ok = adminShellSchema.safeParse({ ...cur, ...value });
    if (!ok.success) throw new ShellSettingsError('INVALID_INPUT', 400, issuesOf(ok.error.issues));
    await write(deps, who, k, cur, ok.data, reason);
  } else {
    const cur = await deps.resolver.value('admin.dashboard', { storeId: S });
    const ok = adminDashboardSchema.safeParse(dashFrom(value));
    if (!ok.success) {
      const fields = issuesOf(ok.error.issues);
      // the two refinements have no path: name the fields they are about
      const msg = ok.error.issues.map((i) => i.message).join(' ');
      throw new ShellSettingsError('INVALID_INPUT', 400, fields.includes('value') ? [/evening/.test(msg) ? 'eveningHour' : 'ranges'] : fields);
    }
    await write(deps, who, k, cur, ok.data, reason);
  }
  return shellScreen(deps, who);
}

/** /api/admin/settings/shell — GET the page (`settings.read`), PUT one card or switch (`settings.write`). */
export async function shellSettingsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'settings.read' : 'settings.write', storeId: S });
  if (g instanceof Response) return g;
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    const screen = method === 'GET' ? await shellScreen(deps!, who) : await saveShellSetting(deps!, who, await body(request));
    return json({ ok: true, ...screen });
  } catch (e) {
    if (e instanceof ShellSettingsError) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}) }, { status: e.status });
    return errorResponse(e);
  }
}
