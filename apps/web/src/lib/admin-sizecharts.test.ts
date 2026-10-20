// PR 28 — the size chart screen's messages without a database: both languages carry the same keys, English has no
// Bengali, every key the screen asks for exists, and every error code its API can send has a text.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import bn from '../../messages/admin-sizecharts.bn.json';
import en from '../../messages/admin-sizecharts.en.json';
import { ADMIN_PAGES } from './admin-nav';
import { t, type Dict } from './i18n';

function keys(d: Dict, prefix = ''): string[] {
  return Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)));
}

describe('size chart screen messages', () => {
  it('both languages have exactly the same keys, none empty; English has no Bengali', () => {
    expect(keys(bn).sort()).toEqual(keys(en).sort());
    for (const k of keys(bn)) {
      expect(t(bn, k), `bn ${k}`).not.toBe('');
      expect(/[ঀ-৿]/.test(t(en, k)), `en ${k}`).toBe(false);
    }
  });

  it('every key the screen asks for exists', () => {
    const src = readFileSync(fileURLToPath(new URL('../components/admin/SizeCharts.tsx', import.meta.url)), 'utf8');
    const asked = [...src.matchAll(/tt\(\s*'([a-zA-Z.]+)'/g)].map((m) => m[1]!);
    expect(asked.length).toBeGreaterThan(40);
    for (const k of new Set(asked)) {
      expect(t(bn, k), k).not.toBe(k);
      expect(t(en, k), k).not.toBe(k);
    }
    for (const k of ['one', 'two', 'three']) expect(t(en, `steps.${k}Text`)).not.toBe(`steps.${k}Text`);
  });

  it('has its page in the admin menu, and texts for the codes its API sends', () => {
    expect(ADMIN_PAGES.find((p) => p.key === 'sizeCharts')?.href).toBe('/admin/size-charts');
    for (const code of ['CHART_IN_USE', 'GARMENT_TYPE_MISMATCH', 'CONFLICT', 'UNKNOWN_KEY', 'PARENT_ARCHIVED', 'NOT_FOUND']) {
      expect(t(bn, `errors.${code}`)).not.toBe(`errors.${code}`);
    }
  });
});
