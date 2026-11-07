// Follow-up 699 (PR 530, a37 browser check of Marketing › Seasonal pages › Each year): a Bengali word left half
// replaced ("পাতায়" → "পেজয়", where Bengali writes "পেজে") read "পেজয় কিছু বাকি আছে" on the page. No Bengali words
// file carries that broken form again.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, '../../messages');
const BROKEN = ['পেজয়'];

describe('follow-up 699: no half-replaced Bengali word in a words file', () => {
  it('no Bengali words file writes "পেজয়"', () => {
    const found = readdirSync(DIR)
      .filter((f) => f.endsWith('.bn.json'))
      .flatMap((f) => BROKEN.filter((w) => readFileSync(join(DIR, f), 'utf8').includes(w)).map((w) => `${f}: ${w}`));
    expect(found).toEqual([]);
  });
});
