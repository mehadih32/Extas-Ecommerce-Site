// S02 · PR 81 (register "The eye-toggle dashboard: every switch in one list, searchable"; BACKEND-ARCHITECTURE WEB-06
// Eye-toggles) — Website › Eye-toggles, the server side: every eye-toggle of PR 80 (@extas/settings eye-toggles.ts) with
// whether it is shown now and its default, and the version the list was read at; saving some of them. Each eye-toggle is
// one yes/no value inside a setting the shop already reads, so a save writes that one value and keeps every other value
// of the setting as it was (writeEye). A save is refused when someone changed one of these settings in between (STALE,
// also a save from the section's own card), refused whole when one id is unknown or a value is not yes/no, and audited
// once (`website.eye.save`, before and after of the changed eye-toggles only). Seeing needs `website.read`, saving
// `website.eye.write`. Hiding deletes nothing: switching it back on shows the part again. No price, order or customer.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { doorNoteTextSchema, EYE_KEYS, EYE_TOGGLES, eyeDefault, eyeToggle, readEye, registry, storeTarget, writeEye, type DoorNoteText, type EyeArea, type EyeScreen, type SettingSpec } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { versionOf } from './words-admin';

const S = MOTHER_STORE_ID;
const REG = registry as unknown as Readonly<Record<string, SettingSpec>>;

export class EyeError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface EyeDeps {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
}

export interface EyeWho {
  actor: Actor;
  ctx: RequestContext;
}

export interface EyeRow {
  id: string;
  area: EyeArea;
  screen: EyeScreen;
  /** Shown on the shop now. */
  shown: boolean;
  /** Shown as shipped (the setting's registry default). */
  def: boolean;
}

export interface EyeView {
  rows: EyeRow[];
  version: string;
}

type Values = Record<string, unknown>;

async function valuesOf(deps: EyeDeps): Promise<Values> {
  const out: Values = {};
  for (const k of EYE_KEYS) out[k] = await deps.resolver.value(k as never, { storeId: S });
  return out;
}

const rowsOf = (values: Values): EyeRow[] =>
  EYE_TOGGLES.map((t) => {
    const def = eyeDefault(t, REG) ?? false;
    return { id: t.id, area: t.area, screen: t.screen, shown: readEye(values[t.key], t.path) ?? def, def };
  });

/** Every eye-toggle with whether it is shown now, and the version of the settings they live in. */
export async function eyeView(deps: EyeDeps): Promise<EyeView> {
  const values = await valuesOf(deps);
  return { rows: rowsOf(values), version: versionOf(values) };
}

/**
 * PUT {version, shown: {id: true|false}}: shows or hides those parts. Every id and value is checked first; one bad one
 * refuses the whole save. Answers the changed ids, every row and the new version.
 */
export async function saveEye(deps: EyeDeps, who: EyeWho, input: unknown): Promise<EyeView & { changed: string[] }> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (typeof o.version !== 'string') throw new EyeError('INVALID_INPUT', 400, ['version']);
  const shown = o.shown;
  if (!shown || typeof shown !== 'object' || Array.isArray(shown)) throw new EyeError('INVALID_INPUT', 400, ['shown']);
  const asked = Object.entries(shown as Record<string, unknown>);
  const bad = asked.filter(([id, v]) => !eyeToggle(id) || typeof v !== 'boolean').map(([id]) => id);
  if (bad.length) throw new EyeError('INVALID_INPUT', 400, bad.slice(0, 20));
  const before = await valuesOf(deps);
  if (o.version !== versionOf(before)) throw new EyeError('STALE', 409);
  const next: Values = { ...before };
  const changed: string[] = [];
  for (const [id, v] of asked) {
    const t = eyeToggle(id)!;
    if (readEye(next[t.key], t.path) === v) continue;
    next[t.key] = writeEye(next[t.key], t.path, v as boolean);
    changed.push(id);
  }
  if (changed.length) {
    const keys = EYE_KEYS.filter((k) => next[k] !== before[k]);
    for (const k of keys) await deps.resolver.set(k as never, next[k] as never, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Eye-toggles' });
    const pick = (vals: Values) => Object.fromEntries(changed.map((id) => [id, readEye(vals[eyeToggle(id)!.key], eyeToggle(id)!.path) ?? null]));
    await audit(deps.db, who.actor, { storeId: S, action: 'website.eye.save', entityType: 'Setting', entityId: keys.join(','), before: pick(before), after: pick(next) }, who.ctx);
  }
  return { rows: rowsOf(next), version: versionOf(next), changed };
}

// ---- Follow-up 679 (registry v265): the door note's words ----
// The door note (checkout, under the settled delivery area) speaks about refusing at the door — a Cash on Delivery
// promise — so its words are only ever the owner's: `checkout.doorNote.text` ships empty and the shop draws nothing
// until he writes them here. A save writes only the words (the switch stays in the list), trimmed, each language at
// most DOOR_NOTE_MAX letters; audited `website.doorNote.save` with before and after. `website.eye.write` to save.

/** The door note's words as they are now (empty strings: none written). */
export const doorNoteView = (deps: EyeDeps): Promise<DoorNoteText> => deps.resolver.value('checkout.doorNote.text', { storeId: S });

/** PUT {en, bn}: the door note's own words (either may be empty). Answers the words as saved. */
export async function saveDoorNote(deps: EyeDeps, who: EyeWho, input: unknown): Promise<{ text: DoorNoteText; changed: boolean }> {
  const parsed = doorNoteTextSchema.safeParse(input);
  if (!parsed.success) throw new EyeError('INVALID_INPUT', 400, [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'text')))]);
  const before = await doorNoteView(deps);
  const next = parsed.data;
  if (before.en === next.en && before.bn === next.bn) return { text: before, changed: false };
  await deps.resolver.set('checkout.doorNote.text', next, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Eye-toggles › Door note words' });
  await audit(deps.db, who.actor, { storeId: S, action: 'website.doorNote.save', entityType: 'Setting', entityId: 'checkout.doorNote.text', before, after: next }, who.ctx);
  return { text: next, changed: true };
}

/** /api/admin/website/eye-toggles/door-note — GET the words (`website.read`); PUT new words (`website.eye.write`). */
export async function doorNoteHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'website.read' : 'website.eye.write', storeId: S });
  if (g instanceof Response) return g;
  const d: EyeDeps = { db: deps!.db, resolver: deps!.resolver };
  try {
    if (method === 'GET') return json({ ok: true, text: await doorNoteView(d) });
    return json({ ok: true, ...(await saveDoorNote(d, { actor: g.actor, ctx: g.ctx }, b)) });
  } catch (e) {
    return answer(e);
  }
}

const answer = (e: unknown): Response => (e instanceof EyeError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/** /api/admin/website/eye-toggles — GET every eye-toggle (`website.read`); PUT some shown or hidden (`website.eye.write`). */
export async function eyeTogglesHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'website.read' : 'website.eye.write', storeId: S });
  if (g instanceof Response) return g;
  const d: EyeDeps = { db: deps!.db, resolver: deps!.resolver };
  try {
    if (method === 'GET') return json({ ok: true, ...(await eyeView(d)) });
    return json({ ok: true, ...(await saveEye(d, { actor: g.actor, ctx: g.ctx }, b)) });
  } catch (e) {
    return answer(e);
  }
}
