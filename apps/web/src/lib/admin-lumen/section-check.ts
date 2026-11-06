// PR 648 (CN-036, lane C) — what a section moved into the Lumen look must hold, read from its sources (used by the
// section tests beside each section's stylesheet): every page root marked data-lm-ready, no colour or font family
// written in its styles (the theme layer's --lm-* tokens only), and no fixed text size under Lumen's 14 px.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADMIN = join(__dirname, '..', '..', 'app', 'admin');

export const readAdmin = (rel: string): string => readFileSync(join(ADMIN, rel), 'utf8');

/** The page roots (`<div className="a2-z…">`) of a page file that are not marked data-lm-ready. */
export function unreadyRoots(src: string): string[] {
  return [...src.matchAll(/<div className="a2-z[^"]*"[^>]*>/g)].map((m) => m[0]).filter((tag) => !tag.includes('data-lm-ready'));
}

/** Colour literals and font families written in a stylesheet (the hardcode guard's admin rule, in small). */
export function styleLiterals(css: string): string[] {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...body.matchAll(/#[0-9A-Fa-f]{3,8}\b|\b(?:rgba?|hsla?)\(|font-family:\s*['"]|\bfont:[^;{}]*'[A-Z]/g)].map((m) => m[0]);
}

/** Fixed font sizes under 14 px in a stylesheet (px values only; tokens and rem are the theme's). */
export function smallSizes(css: string): string[] {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...body.matchAll(/font(?:-size)?:[^;{}]*?\b(\d+(?:\.\d+)?)px/g)].filter((m) => Number(m[1]) < 14).map((m) => m[0]);
}

/** The no-access wrappers (a root holding the "denied" state) that do not carry the page's own data-testid and the
 *  ready mark: the deploy's read-only smoke account sees that state and looks for both (coordinator note, PR 632). */
export function unmarkedDenied(src: string): string[] {
  return [...src.matchAll(/(<div className="a2-z[^"]*"[^>]*>)\s*<ShellState view=\{view\} kind="denied"/g)].map((m) => m[1]!).filter((tag) => !/data-lm-ready=""/.test(tag) || !/data-testid="/.test(tag));
}
