// PR 251 follow-up (689) — the Comments page's back link is a full 44 px tap at every width: its rule outranks the
// shell's 32 px place link (shell.css `.adm2 .a2-crumb a`, phones, tablets and touch screens).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const css = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
/** [ids, classes and attributes, elements] of a simple selector list item. */
const weight = (sel: string) => [(sel.match(/#/g) ?? []).length, (sel.match(/\.|\[/g) ?? []).length, sel.split(/\s+/).filter((p) => /^[a-z]/.test(p)).length];
const outranks = (a: number[], b: number[]) => a[0]! > b[0]! || (a[0] === b[0] && (a[1]! > b[1]! || (a[1] === b[1] && a[2]! >= b[2]!)));

it('the back link takes 44 px and outranks the shell\'s 32 px place link', () => {
  const own = css('./comments.css');
  const rule = own.match(/([^{}]*\.bd-crumb[^{}]*)\{([^}]*)\}/);
  expect(rule?.[2]).toMatch(/min-height:\s*44px/);
  const shell = css('../../../shell.css');
  expect(shell).toMatch(/\.adm2 \.a2-crumb a, \.adm2 \.a2-lnk \{[^}]*min-height: 32px/);
  const strongest = rule![1]!.split(',').map((s) => s.replace(/\/\*[\s\S]*?\*\//g, '').trim()).map(weight).reduce((m, w) => (outranks(w, m) ? w : m));
  expect(outranks(strongest, weight('.adm2 .a2-crumb a'))).toBe(true);
});
