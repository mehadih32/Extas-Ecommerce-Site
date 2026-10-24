// PR 594 (CN-026) — which Bengali page guide belongs to an admin address. The table is help-pages.json (one row per
// built admin page: its route and its guide `<section>/<page>`, docs/admin-guide/pages/<section>/<page>.md); the
// section's overview is docs/admin-guide/pages/<section>/index.md. An address with no page row (a section's
// placeholder, a page not built yet) gets its section's overview alone. tools/admin-guide-check.mjs reads the same
// JSON, so a built page without a guide fails CI. No React, no database: the guide API and the tests read this.
import type { AdminSectionId } from '@extas/settings';
import table from './help-pages.json';
import { locate } from './sections';

export interface HelpPage {
  /** `<section>/<page>`: the guide file under docs/admin-guide/pages/. */
  id: string;
  /** The app route, with `[id]`-style segments for the dynamic parts. */
  route: string;
}

export const HELP_PAGES: readonly HelpPage[] = table.pages;

/** A guide id: `<section>/<page>` (or `<section>/index` for the overview); nothing else is ever read. */
export const PAGE_GUIDE_ID = /^[a-z][a-z0-9-]{0,30}\/[a-z0-9][a-z0-9-]{0,40}$/;

export const sectionOfGuide = (id: string) => id.split('/')[0] as AdminSectionId;

const segs = (p: string) => p.replace(/\/+$/, '').split('/').filter(Boolean);

/** How well a route matches an address: null when it does not, else the number of fixed segments (more is better). */
export function routeScore(route: string, pathname: string): number | null {
  const r = segs(route);
  const p = segs(pathname);
  if (r.length !== p.length) return null;
  let fixed = 0;
  for (let i = 0; i < r.length; i++) {
    if (/^\[[^\]]+\]$/.test(r[i]!)) continue;
    if (r[i] !== p[i]) return null;
    fixed++;
  }
  return fixed;
}

export interface GuidePlace {
  section: AdminSectionId;
  /** The page's own guide, or null (the section's overview alone). */
  page: string | null;
}

/** The guide of an address: the best matching page row, else the section the address belongs to. */
export function guidePlace(pathname: string): GuidePlace | null {
  const path = (pathname.split(/[?#]/)[0] ?? '').replace(/\/+$/, '') || '/admin';
  let best: HelpPage | null = null;
  let score = -1;
  for (const p of HELP_PAGES) {
    const s = routeScore(p.route, path);
    if (s !== null && s > score) {
      best = p;
      score = s;
    }
  }
  if (best) return { section: sectionOfGuide(best.id), page: best.id };
  const here = locate(path);
  return here ? { section: here.section.id, page: null } : null;
}

/** The section's pages, in the overview's order. */
export const sectionPages = (section: string) => HELP_PAGES.filter((p) => sectionOfGuide(p.id) === section);

/**
 * Where the guide opens (CN-026 (b)). The person's own choice is the Settings → Admin look setting (CN-025, wired by a
 * follow-up); until then nothing is passed and the guide opens as the side panel. A phone always gets the full-screen
 * sheet. The pop-up and own-page modes are follow-ups too, so a choice of them opens the side panel for now.
 */
export type GuideMode = 'side' | 'sheet';

export const GUIDE_MODES = ['side'] as const;

export function resolveGuideMode(choice: string | null | undefined, phone: boolean): GuideMode {
  if (phone) return 'sheet';
  return GUIDE_MODES.find((m) => m === choice) ?? 'side';
}
