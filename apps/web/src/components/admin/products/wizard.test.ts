// S28 · PR 685 — the add-product wizard: each step shows only its own parts of the product screen, and every step has
// its words in English and Bengali (Western digits).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WIZARD_KEYS, WIZARD_PARTS } from '@extas/catalogue/wizard-pick';

const css = readFileSync(join(__dirname, 'wizard.css'), 'utf8');
const en = JSON.parse(readFileSync(join(__dirname, '../../../../messages/admin-products.en.json'), 'utf8')).products.wiz;
const bn = JSON.parse(readFileSync(join(__dirname, '../../../../messages/admin-products.bn.json'), 'utf8')).products.wiz;

const ids = [...new Set(Object.values(WIZARD_PARTS).flat())];
const rule = (step: number) => css.split('}').find((b) => b.includes(`data-step="${step}"`)) ?? '';

describe('add-product wizard (PR 685)', () => {
  it('shows, at each step 2-8, only that step parts and hides every other part', () => {
    for (let step = 2; step <= 8; step += 1) {
      const key = WIZARD_KEYS[step - 1]!;
      const mine = new Set(WIZARD_PARTS[key]);
      const block = rule(step);
      for (const id of ids) {
        const hidden = block.includes(`"${id}"]`) || block.includes(`#${id}`);
        expect(hidden, `${key}: ${id}`).toBe(!mine.has(id));
      }
    }
  });

  it('has a name, title and why line for every step, in both languages', () => {
    for (const k of WIZARD_KEYS)
      for (const part of ['name', 'title', 'why']) {
        expect(en.s[k][part], `en ${k}.${part}`).toBeTruthy();
        expect(bn.s[k][part], `bn ${k}.${part}`).toBeTruthy();
      }
    expect(Object.keys(bn).sort()).toEqual(Object.keys(en).sort());
    expect(JSON.stringify(bn)).not.toMatch(/[০-৯]/);
  });
});
