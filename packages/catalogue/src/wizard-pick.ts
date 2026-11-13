// S28 · PR 685 — the add-product wizard's eight steps (pure, no database): which screen parts each step shows, what a
// step needs before the next one, and where a draft stopped. The wizard is a way of walking the product screen one
// part at a time; every save is the screen's own save, so nothing here writes a figure.
export const WIZARD_STEPS = 8;

export type WizardStepKey = 'start' | 'basics' | 'colours' | 'photos' | 'prices' | 'size' | 'search' | 'publish';

export const WIZARD_KEYS: readonly WizardStepKey[] = ['start', 'basics', 'colours', 'photos', 'prices', 'size', 'search', 'publish'];

/** The screen parts (ids on the product screen) each step shows. Step 1 is the start page, not the product screen. */
export const WIZARD_PARTS: Record<WizardStepKey, readonly string[]> = {
  start: [],
  basics: ['sec-basics'],
  colours: ['sec-colours', 'sec-sizes'],
  photos: ['sec-photos', 'wiz-video'],
  prices: ['sec-variants'],
  size: ['wiz-size'],
  search: ['sec-naming'],
  publish: ['sec-publish', 'sec-ready'],
};

/** A step number from the address (`?wizard=3`); anything else means the wizard is off. */
export function parseWizardStep(raw: unknown): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== 'string' || !/^[2-8]$/.test(s)) return null;
  return Number(s);
}

export function wizardKey(step: number): WizardStepKey {
  return WIZARD_KEYS[Math.min(Math.max(Math.trunc(step), 1), WIZARD_STEPS) - 1]!;
}

export interface WizardDraftState {
  /** The step the person was on last (2-8). */
  step: number;
  /** The furthest step reached. */
  furthest: number;
  at: string;
}

/** Reads a stored draft state; anything odd means "not started" (null). */
export function readDraftState(raw: unknown): WizardDraftState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 2 && n <= WIZARD_STEPS;
  if (!ok(r.step) || !ok(r.furthest) || typeof r.at !== 'string') return null;
  return { step: r.step, furthest: Math.max(r.furthest, r.step), at: r.at };
}

/** The next draft state after the person opens `step`. */
export function advanceDraftState(prev: unknown, step: number, now: Date): WizardDraftState {
  const old = readDraftState(prev);
  const s = Math.min(Math.max(Math.trunc(step), 2), WIZARD_STEPS);
  return {
    step: s,
    furthest: Math.max(old?.furthest ?? 2, s),
    at: now.toISOString(),
  };
}

/**
 * Whether a step is done, from plain facts about the draft. Step 2 needs a name and a category, 3 a colour and a size,
 * 4 a front photo, 5 a selling price on every variant, 6 and 7 are optional, 8 is the checklist itself.
 */
export interface WizardFacts {
  hasName: boolean;
  hasCategory: boolean;
  colours: number;
  sizes: number;
  photos: number;
  variants: number;
  pricedVariants: number;
}

export function stepDone(step: number, f: WizardFacts): boolean {
  switch (wizardKey(step)) {
    case 'start':
      return true;
    case 'basics':
      return f.hasName && f.hasCategory;
    case 'colours':
      return f.colours > 0 && f.sizes > 0;
    case 'photos':
      return f.photos > 0;
    case 'prices':
      return f.variants > 0 && f.pricedVariants === f.variants;
    case 'size':
    case 'search':
      return true;
    case 'publish':
      return false;
  }
}

/** The first step that is not done (2-8), or 8 when all before it are. */
export function firstOpenStep(f: WizardFacts): number {
  for (let s = 2; s < WIZARD_STEPS; s += 1) if (!stepDone(s, f)) return s;
  return WIZARD_STEPS;
}
