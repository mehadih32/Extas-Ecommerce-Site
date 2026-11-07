// S13 · PR 280 (register "Seasonal homepage switching, scheduled"; Blueprint CN-012 (1), D10.3) — the pure part of the
// seasonal home page, shared by the shop (which look the home page shows now) and Marketing › Seasonal home (the
// windows' states, the overlap rule, the store's wall clock).
// - A home look is a saved LayoutSnapshot whose payload is `{ scope: 'home', settings: { <home key>: value } }`: the
//   values of the home page's own settings (sections and order, hero words and buttons, the hero's pictures, the
//   categories, new in and reviews rows) as they were saved and then edited for the season (follow-up 649: only the
//   sections, the hero's three lines and the hero pictures' collection are drawn from it; withLook). Each value is checked
//   against its registry schema when it is read; a value that no longer fits is left out, so the home page keeps the
//   owner's own setting for it (never a broken page).
// - A window (ScheduledLayoutSwitch) shows its look from `applyAt` until `revertAt` (none = until it is stopped);
//   STOPPED windows are kept, never deleted. After a window the home page is the owner's own home settings again by
//   itself: nothing is written to the settings, so there is nothing to undo.
import { registry, type Value } from '@extas/settings';

/** The home page's settings a look may carry (the same keys the home page reads). */
export const SEASONAL_HOME_KEYS = ['home.sections', 'home.hero', 'home.heroSlides', 'home.categories', 'home.newIn', 'home.reviews'] as const;
export type SeasonalHomeKey = (typeof SEASONAL_HOME_KEYS)[number];
export type HomeLook = { [K in SeasonalHomeKey]?: Value<K> };

/** The payload's marker for a home look (PR 597's full snapshots carry more; only these keys are read here). */
export const HOME_LOOK_SCOPE = 'home';

/** The look's values that still fit their settings' rules (anything else, or another kind of snapshot, is left out). */
export function lookOf(payload: unknown): HomeLook {
  const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  if (p.scope !== HOME_LOOK_SCOPE || !p.settings || typeof p.settings !== 'object') return {};
  const raw = p.settings as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of SEASONAL_HOME_KEYS) {
    if (!(k in raw)) continue;
    const ok = registry[k].schema.safeParse(raw[k]);
    if (ok.success) out[k] = ok.data;
  }
  return out as HomeLook;
}

/** Follow-up 648: the home page's preview parameter (`?seasonal-look=<look id>`). */
export const PREVIEW_PARAM = 'seasonal-look';
const LOOK_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The look id asked for in the preview parameter (the first value when repeated), or null when it is not a look id. */
export function previewLookId(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && LOOK_ID_RE.test(v) ? v.toLowerCase() : null;
}

/** Follow-up 648: the home page's address that previews a look (`/` or `/bn`, the shop's language prefix given). */
export const previewHref = (home: string, lookId: string): string => `${home}?${PREVIEW_PARAM}=${encodeURIComponent(lookId)}`;

/** A look's payload as it is saved. */
export const lookPayload = (look: HomeLook): { scope: typeof HOME_LOOK_SCOPE; settings: HomeLook } => ({ scope: HOME_LOOK_SCOPE, settings: look });

/**
 * The shop's settings with the look's own parts in their place (the rest unchanged).
 * ~~`{ ...s, ...look }`: every saved key, as it was at save time~~ Follow-up 649: a look owns only what its editor
 * changes — the sections and their order, the hero's three lines, and the hero pictures' collection. The hero's buttons
 * and promise lines (and its other parts), the rest of the hero pictures' setting, and the categories, new in and
 * reviews rows are always the owner's own settings as they are now, so a later change to them reaches every look.
 */
export function withLook<S extends Record<string, unknown>>(s: S, look: HomeLook): S {
  const out: Record<string, unknown> = { ...s };
  if (look['home.sections']) out['home.sections'] = look['home.sections'];
  const hero = look['home.hero'];
  const ownHero = s['home.hero'] as Value<'home.hero'> | undefined;
  if (hero) out['home.hero'] = ownHero ? { ...ownHero, eyebrow: hero.eyebrow, title: hero.title, sub: hero.sub } : hero;
  const slides = look['home.heroSlides'];
  const ownSlides = s['home.heroSlides'] as Value<'home.heroSlides'> | undefined;
  if (slides) out['home.heroSlides'] = ownSlides ? { ...ownSlides, collection: slides.collection } : slides;
  return out as S;
}

export interface WindowTimes {
  applyAt: Date;
  revertAt: Date | null;
  status: string;
}

export type WindowState = 'UPCOMING' | 'LIVE' | 'ENDED' | 'STOPPED';

/** Where a window stands at `now`. */
export function windowState(w: WindowTimes, now: Date): WindowState {
  if (w.status !== 'SCHEDULED') return 'STOPPED';
  if (w.applyAt.getTime() > now.getTime()) return 'UPCOMING';
  return w.revertAt && w.revertAt.getTime() <= now.getTime() ? 'ENDED' : 'LIVE';
}

/** The window showing now: the live one that started last (overlaps are refused, so normally there is one). */
export function liveWindow<W extends WindowTimes>(rows: readonly W[], now: Date): W | null {
  const live = rows.filter((w) => windowState(w, now) === 'LIVE');
  return live.sort((a, b) => b.applyAt.getTime() - a.applyAt.getTime())[0] ?? null;
}

/** Two windows share a moment (a window without an end runs on until it is stopped). */
export function overlaps(a: { applyAt: Date; revertAt: Date | null }, b: { applyAt: Date; revertAt: Date | null }): boolean {
  const aEnd = a.revertAt?.getTime() ?? Infinity;
  const bEnd = b.revertAt?.getTime() ?? Infinity;
  return a.applyAt.getTime() < bEnd && b.applyAt.getTime() < aEnd;
}

// ---- the store's wall clock (the owner types times as his shop's clock shows them) ----

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function partsIn(at: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), mi: Number(p.minute) };
}

/** A `YYYY-MM-DDTHH:mm` time on the store's clock as an instant; null when empty; undefined when it is not a real time. */
export function wallToUtc(v: unknown, timeZone: string): Date | null | undefined {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return null;
  const m = typeof v === 'string' ? WALL_RE.exec(v.trim()) : null;
  if (!m) return undefined;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wall);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return undefined;
  let t = wall;
  for (let i = 0; i < 2; i++) {
    const z = partsIn(new Date(t), timeZone);
    t = wall - (Date.UTC(z.y, z.m - 1, z.d, z.h, z.mi) - t);
  }
  return new Date(t);
}

/** An instant as `YYYY-MM-DDTHH:mm` on the store's clock (the value a time box shows). */
export function utcToWall(at: Date, timeZone: string): string {
  const z = partsIn(at, timeZone);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${z.y}-${two(z.m)}-${two(z.d)}T${two(z.h)}:${two(z.mi)}`;
}
