// PR 576 — the combo template ranking: a 100-point score per template from what the matrix runner
// (tools/combo-matrix.mjs) measured on the real app, with the weights of docs/owner/COMBO-RANKING.md §2. Pure: no
// browser, no files, so the weights are tested on their own (combo-ranking.test.mjs).
//   product page (P1–P5, current): taps to bag 20 · first screen 20 · errors 15 · layout 15 · time 10 · tap targets 10 ·
//     words above the fold 5 · desktop works 5
//   category page (L1–L5): taps landing → bag 20 · first screen 20 · layout 15 · time 10 · choice 10 · errors 10 ·
//     targets 10 · words 5
//   bag (current, B1–B5): change-size taps 20 · money correct 15 · first screen 15 · required features 15 · layout 15 ·
//     targets 10 · change time 5 · compactness 5
// Knock-out (research §10.2): a journey that fails on any screen, or a wrong price in the bag, puts the template out
// whatever its total.

/** The method's own constants (docs/owner/COMBO-RANKING.md), not shop settings. */
export const RANKING = Object.freeze({
  weights: {
    product: { taps: 20, first: 20, errors: 15, layout: 15, time: 10, targets: 10, words: 5, desktop: 5 },
    category: { taps: 20, first: 20, layout: 15, time: 10, choice: 10, errors: 10, targets: 10, words: 5 },
    bag: { taps: 20, money: 15, first: 15, features: 15, layout: 15, targets: 10, time: 5, compact: 5 },
  },
  /** Taps a set type should need to reach the bag; each extra tap costs `tapPenalty` points. */
  targetTaps: { pair: 2, pack: 2, topBottom: 3, mixed: 4 },
  tapPenalty: 5,
  /** Estimated human time: per tap, per scroll, per new page (seconds). */
  secPerTap: 1.1,
  secPerScroll: 1.2,
  secPerPage: 0.6,
  /** Words above the fold: full points up to `wordsTarget`, none from `wordsZero`. */
  wordsTarget: 40,
  wordsZero: 120,
  /** Each layout fault (sideways scroll, cut text, wrapped price) and each small tap target costs this much. */
  layoutFault: 5,
  smallTarget: 2,
  /** Cards a category page should show in its first two screens for full "choice" points. */
  choiceCards: 6,
  /** Bag: the height of one combo that earns full compactness, and the height that earns none (px). */
  compactBest: 70,
  compactWorst: 300,
  /** Bag: the taps a size change should need (a size changed in the bag). */
  bagTargetTaps: 2,
});

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const round1 = (n) => Math.round(n * 10) / 10;

/** Seconds a person would take for `taps`, `scrolls` and `pages`. */
export const humanSeconds = ({ taps = 0, scrolls = 0, pages = 0 }) => taps * RANKING.secPerTap + scrolls * RANKING.secPerScroll + pages * RANKING.secPerPage;

const tapsPoints = (w, taps, target) => (taps == null ? 0 : Math.max(0, w - RANKING.tapPenalty * Math.max(0, taps - target)));
const timePoints = (w, sec, target) => (sec == null || sec <= 0 ? 0 : w * clamp01((target * RANKING.secPerTap) / sec));
const wordsPoints = (w, words) => w * clamp01((RANKING.wordsZero - words) / (RANKING.wordsZero - RANKING.wordsTarget));
const layoutPoints = (w, m) => Math.max(0, w - RANKING.layoutFault * ((m.overflow ? 1 : 0) + (m.cut ?? 0) + (m.wrapped ?? 0)));
const targetPoints = (w, small) => Math.max(0, w - RANKING.smallTarget * (small ?? 0));

/**
 * One product-page run: { set: 'pair'|'pack'|'topBottom'|'mixed', added, taps, scrolls, first (0–1 share of photo,
 * price, size row and button on the first screen), earlyError (the early tap showed an inline error and added
 * nothing), jsErrors, overflow, cut, wrapped, small, words, desktopAdded }.
 */
export function scoreProduct(m) {
  const w = RANKING.weights.product;
  const target = RANKING.targetTaps[m.set] ?? RANKING.targetTaps.pair;
  const parts = {
    taps: m.added ? tapsPoints(w.taps, m.taps, target) : 0,
    first: w.first * clamp01(m.first ?? 0),
    errors: m.earlyError && !m.jsErrors ? w.errors : 0,
    layout: layoutPoints(w.layout, m),
    time: m.added ? timePoints(w.time, humanSeconds(m), target) : 0,
    targets: targetPoints(w.targets, m.small),
    words: wordsPoints(w.words, m.words ?? 0),
    desktop: m.desktopAdded ? w.desktop : 0,
  };
  return finish(parts, !m.added);
}

/**
 * One category-page run: { added, taps, scrolls, pages, first (0–1: price, saving, two full cards), cards (in the
 * first two screens), jsErrors, overflow, cut, wrapped, small, words, set }.
 */
export function scoreCategory(m) {
  const w = RANKING.weights.category;
  // landing → bag: one tap more than the pair page's own target (the card)
  const target = (RANKING.targetTaps[m.set] ?? RANKING.targetTaps.pair) + 1;
  const parts = {
    taps: m.added ? tapsPoints(w.taps, m.taps, target) : 0,
    first: w.first * clamp01(m.first ?? 0),
    layout: layoutPoints(w.layout, m),
    time: m.added ? timePoints(w.time, humanSeconds(m), target) : 0,
    choice: w.choice * clamp01((m.cards ?? 0) / RANKING.choiceCards),
    errors: m.jsErrors ? 0 : w.errors,
    targets: targetPoints(w.targets, m.small),
    words: wordsPoints(w.words, m.words ?? 0),
  };
  return finish(parts, !m.added);
}

/**
 * One bag run: { changed (a size changed and stuck), taps, scrolls, pages, moneyOk, first (0–1: sets fully visible
 * and the total), features (0–1: change link, save, remove on every set), overflow, cut, wrapped, small, pxPerSet }.
 */
export function scoreBag(m) {
  const w = RANKING.weights.bag;
  const parts = {
    taps: m.changed ? tapsPoints(w.taps, m.taps, RANKING.bagTargetTaps) : 0,
    money: m.moneyOk ? w.money : 0,
    first: w.first * clamp01(m.first ?? 0),
    features: w.features * clamp01(m.features ?? 0),
    layout: layoutPoints(w.layout, m),
    targets: targetPoints(w.targets, m.small),
    time: m.changed ? timePoints(w.time, humanSeconds(m), RANKING.bagTargetTaps) : 0,
    compact: w.compact * clamp01((RANKING.compactWorst - (m.pxPerSet ?? RANKING.compactWorst)) / (RANKING.compactWorst - RANKING.compactBest)),
  };
  return finish(parts, !m.changed || !m.moneyOk);
}

function finish(parts, knockedOut) {
  const rounded = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, round1(v)]));
  return { parts: rounded, total: round1(Object.values(parts).reduce((a, b) => a + b, 0)), knockedOut };
}

/**
 * Ranks the runs of one page type: [{ template, total, ... }] → per template its mean, lowest, runs and knock-outs,
 * best first; a template with any knock-out sorts after every template without one.
 */
export function rankTemplates(runs) {
  const by = new Map();
  for (const r of runs) by.set(r.template, [...(by.get(r.template) ?? []), r]);
  const rows = [...by].map(([template, rs]) => ({
    template,
    runs: rs.length,
    mean: round1(rs.reduce((a, r) => a + r.total, 0) / rs.length),
    lowest: round1(Math.min(...rs.map((r) => r.total))),
    knockedOut: rs.filter((r) => r.knockedOut).length,
  }));
  return rows.sort((a, b) => (a.knockedOut > 0) - (b.knockedOut > 0) || b.mean - a.mean || b.lowest - a.lowest || a.template.localeCompare(b.template));
}
