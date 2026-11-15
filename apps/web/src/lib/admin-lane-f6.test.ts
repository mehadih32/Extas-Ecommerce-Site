// Parity round 3, lane F6 (PR 865-867): the English and Bengali words of the lane carry the same keys and the same {placeholders},
// and no Bengali line is left empty or in English only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(__dirname, '..', '..', 'messages');
const flat = (o: unknown, pre = '', out: Record<string, string> = {}): Record<string, string> => {
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (v && typeof v === 'object') flat(v, `${pre}${k}.`, out);
    else out[`${pre}${k}`] = String(v);
  }
  return out;
};
const load = (l: 'en' | 'bn') => flat(JSON.parse(readFileSync(join(dir, `admin-lane-f6.${l}.json`), 'utf8')));
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('lane F6 messages', () => {
  const en = load('en');
  const bn = load('bn');
  it('has the same keys in both languages', () => {
    expect(Object.keys(bn).sort()).toEqual(Object.keys(en).sort());
  });
  it('keeps the same placeholders', () => {
    for (const k of Object.keys(en)) expect(holes(bn[k] ?? ''), k).toBe(holes(en[k] ?? ''));
  });
  it('has no empty line and a Bengali line that is Bengali', () => {
    for (const k of Object.keys(en)) {
      expect((en[k] ?? '').trim(), k).not.toBe('');
      // the shop's product descriptions are written in English on purpose (lf6.sf.desc.*); the Google product name stays
      if (!k.startsWith('lf6.sf.desc.') && k !== 'lf6.sf.google') expect(/[ঀ-৿]/.test(bn[k] ?? ''), k).toBe(true);
    }
  });
});
