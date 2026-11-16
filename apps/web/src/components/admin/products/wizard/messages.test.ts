// S28 · PR 1032 — the wizard's words: every plain key a wizard file asks for exists in English and in Bengali, the two languages hold the
// same wizard keys, and the keys built from a list (details, fits, runs, checks) exist for every member of that list.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DETAIL_SETS, WIZARD_FITS, WIZARD_FOR, WIZARD_LINKS, WIZARD_RUNS } from '@extas/catalogue';
import en from '../../../../../messages/admin-products.en.json';
import bn from '../../../../../messages/admin-products.bn.json';

type Tree = { [k: string]: string | Tree };
const get = (j: Tree, key: string): unknown => key.split('.').reduce<unknown>((o, p) => (o && typeof o === 'object' ? (o as Tree)[p] : undefined), j);
const flat = (o: Tree, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));

const dir = __dirname;
const files = [...readdirSync(dir).filter((f) => f.endsWith('.tsx')).map((f) => join(dir, f)), join(dir, '..', 'wizard-ui.tsx')];
const used = new Set<string>();
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/t\(d, ['`]([^'`$]+)['`]/g)) used.add(m[1]!);

describe('wizard words', () => {
  it('has every plain key in English and Bengali', () => {
    const missing = [...used].filter((k) => typeof get(en as Tree, k) !== 'string' || typeof get(bn as Tree, k) !== 'string');
    expect(missing).toEqual([]);
  });
  it('holds the same wizard keys in both languages', () => {
    const a = flat((en as Tree).products as Tree).filter((k) => k.startsWith('wiz.'));
    const b = new Set(flat((bn as Tree).products as Tree).filter((k) => k.startsWith('wiz.')));
    expect(a.filter((k) => !b.has(k))).toEqual([]);
  });
  it('has the words of every listed choice', () => {
    const keys: string[] = [
      ...Object.values(DETAIL_SETS).flat().flatMap((k) => [`products.wiz.det.${k}`, `products.wiz.det.${k}Ph`]),
      ...WIZARD_FOR.map((k) => `products.wiz.name.for_${k}`),
      ...WIZARD_LINKS.flatMap((k) => [`products.wiz.col.link_${k}`, `products.wiz.col.linkNote_${k}`]),
      ...WIZARD_FITS.map((k) => `products.wiz.txt.fit_${k}`),
      ...WIZARD_RUNS.map((k) => `products.wiz.txt.run_${k}`),
      ...['title', 'description', 'keyword', 'ownText', 'alt', 'slug', 'place'].map((k) => `products.wiz.google.ck_${k}`),
      ...['good', 'ok', 'weak'].map((k) => `products.wiz.google.band_${k}`),
      ...['ERP_V5', 'COLOUR_MISSING', 'SKU_IN_OTHER_PRODUCT', 'ROW_NOT_ACCEPTED', 'NOTHING_TO_IMPORT', 'ERP_ON_PRACTICE'].map((k) => `products.wiz.pick.block.${k}`),
      ...['NO_COLOUR', 'FRONT_PHOTO', 'PRICE_NOT_CONFIRMED'].map((k) => `products.wiz.pub.gap_${k}`),
      ...['start', 'basics', 'colours', 'photos', 'prices', 'size', 'search'].map((k) => `products.wiz.pub.ck_${k}`),
      ...['start_style', 'start_bottom', 'basics_name', 'colours_colours', 'photos_photos', 'prices_price', 'prices_pin', 'size_description', 'search_google'].map((k) => `products.wiz.pub.ck_${k}`),
      ...['name', 'colours', 'photos', 'price'].map((k) => `products.wiz.ph.gap_${k}`),
      ...['H1', 'H2', 'W1', 'W2'].map((k) => `products.wiz.txt.f${k}`),
    ];
    const missing = keys.filter((k) => typeof get(en as Tree, k) !== 'string' || typeof get(bn as Tree, k) !== 'string');
    expect(missing).toEqual([]);
  });
});
