// S11 · PR 234 — every word the "Real visitors' speed" card (Website › SEO) and the Server page's speed section ask
// for exists in both languages, the dynamic families (metrics, kinds of page, fields, targets) complete.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import seoBn from '../../../messages/admin-seo.bn.json';
import seoEn from '../../../messages/admin-seo.en.json';
import serverBn from '../../../messages/admin-server.bn.json';
import serverEn from '../../../messages/admin-server.en.json';
import { PAGE_KINDS, VITAL_METRICS } from './vitals';

const card = readFileSync(join(__dirname, '../../components/admin/website/VitalsCard.tsx'), 'utf8');
const server = readFileSync(join(__dirname, '../../app/admin/server/page.tsx'), 'utf8');
const pick = (o: unknown, path: string) => path.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

describe("Website › SEO › Real visitors' speed words", () => {
  const plain = [...card.matchAll(/\bvt\(\s*d,\s*"([^"]+)"/g)].map((m) => m[1]!);
  const ternary = [...card.matchAll(/\bvt\(\s*d,\s*[^"`)]+\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g)].flatMap((m) => [m[1]!, m[2]!]);
  const families = [
    ...['share', 'days'].flatMap((k) => [`f.${k}`, `f.${k}Hint`]),
    ...VITAL_METRICS.map((m) => `m.${m}`),
    ...PAGE_KINDS.map((k) => `kind.${k}`),
    ...['lcpMs', 'clsThousandths', 'inpMs', 'ttfbMs', 'categoryKb', 'adminMs', 'hint'].map((k) => `t.${k}`),
  ];

  it.each([
    ['en', seoEn],
    ['bn', seoBn],
  ])('%s has every word the card uses', (_lang, dict) => {
    expect(plain.length).toBeGreaterThan(10);
    expect(ternary).toEqual(expect.arrayContaining(['span', 'noReadings', 'labOk', 'labMiss']));
    expect([...plain, ...ternary, ...families].filter((k) => typeof pick(dict.vt, k) !== 'string')).toEqual([]);
  });

  it.each([
    ['en', serverEn],
    ['bn', serverBn],
  ])('%s has every word the Server page speed section uses', (_lang, dict) => {
    const used = [...server.matchAll(/'(server\.speed\.[A-Za-z]+)'/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(5);
    expect([...used, ...['LCP', 'INP', 'CLS'].map((m) => `server.speed.${m}`)].filter((k) => typeof pick(dict, k) !== 'string')).toEqual([]);
  });
});
