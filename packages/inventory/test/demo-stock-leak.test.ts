// PR 710: demo products must never count in stock totals (location totals, low stock, shortage, stock count, overview).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (p: string): string => readFileSync(join(__dirname, '..', 'src', p), 'utf8');

describe('demo stock stays out of the totals', () => {
  for (const f of ['locations.ts', 'low-stock.ts', 'shortage.ts', 'stock-audit.ts']) {
    it(`${f} filters out demo products`, () => {
      expect(src(f)).toContain('product: { isDemo: false }');
    });
  }
});
