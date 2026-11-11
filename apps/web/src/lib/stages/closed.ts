// S19 · PR 652 (CN-036, owner 6 Nov 2026; updated 6 Nov 14:55 Dhaka) — the closed stages hidden by a switch. The owner
// closed S15 (AI control room), S17 (multi-store), S23 (social studio), S24 (virtual photoshoot), S25 (video campaign),
// S26 and S27 (handover pack) until he says so. Each one's switch (`stages.closedShown`, off as shipped) hides every
// half-built part of that stage: its admin sections and tabs from the menu and the admin search (the shell's viewer,
// lib/admin-shell/sections.ts), its shop pages from the sitemap (lib/seo/sitemap-data.ts), robots
// (lib/seo/robots.ts: Disallow) and the shop search (which lists products only, so a closed stage's page can never be
// a result; a stage that adds pages to it filters them with `isHiddenPath`). Built parts stay (nothing deleted); the switch is turned on when
// the stage is finished. A new part of a closed stage is listed here in the same commit that builds it.
// The parts as of 6 Nov 2026:
// - S15: the AI Center section (`ai`; with S15 closed it is not shown, its checklist audit page keeps its address) and
//   the round assistant button (not built yet: `assistant`, read by the shell when it is built);
// - S17: only the launch slice PR 362 is built (the Cloudflare cache rule and extra host names, server side, in use by
//   the live shop): no page to hide;
// - S23, S24, S26, S27: nothing built.
// - S25 (CN-039, reopened 11 Nov 2026): the Studio tab under Marketing (`marketing.studio`, PR 481) and its pages as
//   PR 482–490 add them. The whole tab stays hidden until the stage is finished and gated (`stages.closedShown.S25`).
import type { AdminDeps } from '../admin-auth';
import { CLOSED_STAGES, CLOSED_STAGES_SHOWN_DEFAULT, type ClosedStage, type ClosedStagesShown } from '@extas/settings';

export interface StageParts {
  /** Admin sections (sidebar entries) of the stage. */
  sections: readonly string[];
  /** Admin tabs of the stage inside another section, as `<section>.<tab>`. */
  tabs: readonly string[];
  /** Admin parts that are not a page (`assistant`: the round assistant button). */
  widgets: readonly string[];
  /** Shop addresses of the stage (a path and everything under it), for the sitemap, robots and the shop search. */
  shop: readonly string[];
}

const NONE: StageParts = { sections: [], tabs: [], widgets: [], shop: [] };

export const CLOSED_STAGE_PARTS: Readonly<Record<ClosedStage, StageParts>> = {
  S15: { ...NONE, sections: ['ai'], widgets: ['assistant'] },
  S17: NONE,
  S23: NONE,
  S24: NONE,
  S25: { ...NONE, tabs: ['marketing.studio'] },
  S26: NONE,
  S27: NONE,
};

/** The stages whose switch is off (hidden). An unreadable value hides them all (the shipped state). */
export function hiddenStages(shown: Partial<ClosedStagesShown> | null | undefined): ClosedStage[] {
  const v = shown ?? CLOSED_STAGES_SHOWN_DEFAULT;
  return CLOSED_STAGES.filter((s) => v[s] !== true);
}

/** Every hidden admin part as the shell's viewer reads it: section ids, `<section>.<tab>` ids and widget names. */
export function hiddenAdminParts(shown: Partial<ClosedStagesShown> | null | undefined): Set<string> {
  return new Set(hiddenStages(shown).flatMap((s) => [...CLOSED_STAGE_PARTS[s].sections, ...CLOSED_STAGE_PARTS[s].tabs, ...CLOSED_STAGE_PARTS[s].widgets]));
}

/**
 * PR 652 follow-up (669): the closed stage a hidden admin part (a section id, `<section>.<tab>` or a widget) belongs
 * to, so its address can say "closed by the owner for now" instead of "no access"; null for a part of no closed stage.
 */
export function closedStageOfPart(part: string): ClosedStage | null {
  for (const s of CLOSED_STAGES) {
    const p = CLOSED_STAGE_PARTS[s];
    if (p.sections.includes(part) || p.tabs.includes(part) || p.widgets.includes(part)) return s;
  }
  return null;
}

/** The shop addresses of the hidden stages. */
export function hiddenShopPaths(shown: Partial<ClosedStagesShown> | null | undefined): string[] {
  return hiddenStages(shown).flatMap((s) => [...CLOSED_STAGE_PARTS[s].shop]);
}

/** An address that is one of `paths` or under one (`/a` hides `/a` and `/a/b`, never `/ab`), in either language. */
export function isHiddenPath(path: string, paths: readonly string[]): boolean {
  const p = (path.split(/[?#]/)[0] ?? '').replace(/\/+$/, '').replace(/^\/bn(?=\/|$)/, '') || '/';
  return paths.some((h) => {
    const x = h.replace(/\/+$/, '');
    return x !== '' && (p === x || p.startsWith(`${x}/`));
  });
}

/** The hidden admin parts read from the settings (unreadable: all hidden, the shipped state). */
export async function hiddenPartsOf(deps: Pick<AdminDeps, 'resolver'>): Promise<Set<string>> {
  return hiddenAdminParts(await deps.resolver.value('stages.closedShown', {}).catch(() => null));
}
