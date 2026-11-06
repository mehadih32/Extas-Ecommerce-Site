// PR 40 follow-up — the computer's header row with a long slogan (found by builder 30 with the sample slogan of
// follow-up 111). The demo keeps the desktop slogan in the flow under the logo, "so the nav row's own fit (deskNavFit)
// counts it" (03-layout.js, 97-desk-a.js), and steps the phone slogan full → short → hidden (hdrSlogFit). Here the
// row does both: first the last categories fold into More, as the demo does; when the row still does not fit with
// every foldable category under More, the desktop slogan steps down the phone's way (short, then hidden) and the row
// is measured again. A nav item narrower than its own words counts as "does not fit": the items may shrink to 32 px
// (demo r12-zfix.css), and a squeezed item's words ran into the next one ("T-ShirtsShirts") while no box overlapped.

/** The slogan steps the row may use: 0 the full slogan, 1 the short one (only when the owner wrote one), 2 none. */
export function deskSloganSteps(hasShort: boolean): readonly number[] {
  return hasShort ? [0, 1, 2] : [0, 2];
}

/**
 * Fits the row: at each slogan step (shown with `setStep`), `foldUntilFits` unfolds everything, folds the last
 * categories until the row fits and answers whether it does. Returns the step that fits, or the last step.
 */
export function fitDeskRow(steps: readonly number[], setStep: (step: number) => void, foldUntilFits: () => boolean): number {
  const list = steps.length ? steps : [0];
  for (const step of list) {
    setStep(step);
    if (foldUntilFits()) return step;
  }
  return list[list.length - 1]!;
}

/** An item is squeezed when its words (and chevron) are wider than its own box, past a pixel of rounding. */
export function wordsSqueezed(wordsWidth: number, boxWidth: number): boolean {
  return wordsWidth > boxWidth + 1;
}
