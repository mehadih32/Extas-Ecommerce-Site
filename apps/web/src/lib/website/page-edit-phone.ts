// S02 · PR 600 — the phone checks' verdict for "Apply to phone too?" (no imports: the shop's edit panel uses it in the
// browser; lib/website/page-edit-model re-exports it). What the browser measured on one phone size
// (components/shop/page-edit-measure.ts) is read against the checks the owner switched on (`shop.pageEdit.checks`).

/** What the browser measured on one phone size (components/shop/page-edit-measure.ts). */
export interface PhoneMeasure {
  name: string;
  w: number;
  h: number;
  /** The preview loaded in time. */
  loaded: boolean;
  /** How far the page is wider than the phone (px; 0 = fits). */
  sideways: number;
  /** Texts cut off. */
  cut: string[];
  /** Tap targets under the size (in the changed sections). */
  small: string[];
  /** The buy button: on the first screen, below it, or not on this page. */
  buy: 'above' | 'below' | 'none';
}

export type PhoneIssue = 'load' | 'sideways' | 'cut' | 'taps' | 'buyFold';

export function judgePhone(m: PhoneMeasure, cfg: { checks: { sideways: boolean; cut: boolean; taps: boolean; buyFold: boolean } }): { pass: boolean; issues: PhoneIssue[] } {
  const issues: PhoneIssue[] = [];
  if (!m.loaded) issues.push('load');
  else {
    if (cfg.checks.sideways && m.sideways > 1) issues.push('sideways');
    if (cfg.checks.cut && m.cut.length) issues.push('cut');
    if (cfg.checks.taps && m.small.length) issues.push('taps');
    if (cfg.checks.buyFold && m.buy === 'below') issues.push('buyFold');
  }
  return { pass: issues.length === 0, issues };
}
