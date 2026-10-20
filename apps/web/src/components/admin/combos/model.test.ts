// S03 · PR 90 — the combo screens without a database: both languages carry the same keys and none overlaps another
// admin file, every key the screens ask for is a line of words, every refusal, state, type and blocking reason has its
// words, and the pure helpers (money typed in, the price box's words, the form and its input).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXED_COMBO_TYPES, setPricing, fixedComboInputSchema } from '@extas/combos/pure';
import adminBn from '../../../../messages/admin.bn.json';
import adminEn from '../../../../messages/admin.en.json';
import productsBn from '../../../../messages/admin-products.bn.json';
import toolsBn from '../../../../messages/admin-tools.bn.json';
import stockBn from '../../../../messages/admin-stock.bn.json';
import rulesBn from '../../../../messages/admin-rules.bn.json';
import bn from '../../../../messages/admin-combos.bn.json';
import en from '../../../../messages/admin-combos.en.json';
import { adminDicts } from '@/lib/admin-i18n';
import { ADMIN_PAGES } from '@/lib/admin-nav';
import { t, type Dict } from '@/lib/i18n';
import { emptyForm, formFromView, inputFromForm, isArchived, money, nameIn, oneProductForm, saveWords, slugify, stateTag, toMajorText, toMinor } from './model';

function keys(d: Dict, prefix = ''): string[] {
  return Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)));
}
const fmt = (m: number | null) => (m === null ? '' : `T${m / 100}`);
const ROUND = { stepMinor: 1, direction: 'down' as const };

describe('combo admin messages', () => {
  it('both languages have the same keys, none empty; English has no Bengali', () => {
    expect(keys(bn as Dict).sort()).toEqual(keys(en as Dict).sort());
    for (const k of keys(bn as Dict)) {
      expect(t(bn as Dict, k), k).not.toBe('');
      expect(/[ঀ-৿]/.test(t(en as Dict, k)), k).toBe(false);
    }
  });

  it('no key is also in another admin file (the merge would hide one)', () => {
    const taken = new Set([adminBn, adminEn, productsBn, toolsBn, stockBn, rulesBn].flatMap((o) => keys(o as Dict)));
    expect(keys(bn as Dict).filter((k) => taken.has(k))).toEqual([]);
  });

  it('every fixed key the screens ask for is a line of words', () => {
    for (const file of ['CombosScreen.tsx', 'FixedTab.tsx', 'ComboEditor.tsx']) {
      const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      const asked = [...src.matchAll(/\btt\('([A-Za-z0-9.]+)'/g)].map((m) => `combos.${m[1]}`);
      expect(asked.length, file).toBeGreaterThan(0);
      for (const d of [adminDicts.bn, adminDicts.en]) for (const k of asked) expect(t(d, k), `${file}: ${k}`).not.toBe(k);
    }
  });

  it('every refusal, state, type, blocking reason and the nav have their words', () => {
    const errors = ['INVALID_INPUT', 'NOT_FOUND', 'SLUG_TAKEN', 'STALE', 'OWNER_OK_REQUIRED', 'NOT_READY', 'KEY_FIXED', 'SET_INVALID', 'CART_NOT_OPEN', 'NO_PIECE_PHOTO', 'NO_STORAGE', 'invalid-store-id', 'not-found', 'method-not-allowed'];
    for (const d of [adminDicts.bn, adminDicts.en]) {
      const has = (k: string) => expect(t(d, k), k).not.toBe(k);
      for (const c of errors) has(`errors.${c}`);
      for (const s of ['live', 'soon', 'ended', 'off', 'draft'] as const) has(`combos.${stateTag(s).key}`);
      for (const k of FIXED_COMBO_TYPES) has(`combos.types.${k}`);
      for (const k of ['NO_PIECES', 'NO_PRODUCT', 'NO_SET_PRICE', 'PIECE_NO_PRICE']) has(`combos.blocking.${k}`);
      for (const p of ADMIN_PAGES.filter((x) => x.group === 'combos')) has(`nav.${p.key}`);
      has('frame.groups.combos');
    }
    expect(t(adminBn as Dict, 'nav.combos')).not.toBe('nav.combos');
  });
});

describe('combo screen helpers', () => {
  it('money is typed in whole taka (Bengali digits too) and kept in poisha; empty is not set; junk is NaN', () => {
    expect(toMinor('2050')).toBe(205000);
    expect(toMinor('২০৫০')).toBe(205000);
    expect(toMinor(' 1,490 ')).toBe(149000);
    expect(toMinor('')).toBeNull();
    expect(toMinor('12a')).toBeNaN();
    expect(toMajorText(205000)).toBe('2050');
    expect(toMajorText(null)).toBe('');
    expect(money(205000, 'en-US', 'BDT')).toMatch(/2,050/);
    expect(money(null, 'en-US', 'BDT')).toBe('');
  });

  it('the price box words follow the same rule as the bag: offer, not lower, no price, a piece without price', () => {
    const pieces = [
      { priceMinor: 120000, quantity: 1 },
      { priceMinor: 110000, quantity: 1 },
    ];
    const offer = saveWords(setPricing({ mode: 'FIXED', setMinor: 205000 }, pieces, ROUND), fmt);
    expect(offer).toEqual({ key: 'price.saves', vars: { regular: 'T2300', saving: 'T250', percent: '10' }, tone: 'ok' });
    expect(saveWords(setPricing({ mode: 'FIXED', setMinor: 230000 }, pieces, ROUND), fmt)).toMatchObject({ key: 'price.notLower', vars: { regular: 'T2300' }, tone: 'warn' });
    expect(saveWords(setPricing({ mode: 'FIXED', setMinor: null }, pieces, ROUND), fmt).key).toBe('price.enter');
    expect(saveWords(setPricing({ mode: 'FIXED', setMinor: 1000 }, [{ priceMinor: null, quantity: 1 }, pieces[0]!], ROUND), fmt).key).toBe('price.pieceNoPrice');
  });

  it('states: live and soon are on the list, ended and off are the archive', () => {
    expect(stateTag('live').tone).toBe('ok');
    expect(stateTag('ended').tone).toBe('warn');
    expect(isArchived('ended') && isArchived('off')).toBe(true);
    expect(isArchived('live') || isArchived('soon') || isArchived('draft')).toBe(false);
  });

  it('the form gives the API input the schema takes; empty piece rows drop out; the link comes from the name', () => {
    const P1 = '00000000-0000-4000-8000-000000000001';
    const P2 = '00000000-0000-4000-8000-000000000002';
    const f = { ...emptyForm(), nameEn: 'Polo & Chino Set', items: [{ productId: P1, colourIds: [], quantity: 1, labelEn: '', labelBn: '' }, { productId: P2, colourIds: [], quantity: 1, labelEn: '', labelBn: '' }, { productId: '', colourIds: [], quantity: 1, labelEn: '', labelBn: '' }], price: '2050' };
    const input = inputFromForm(f);
    expect(input.slug).toBe('polo-chino-set');
    expect(input.items).toHaveLength(2);
    expect(input.setPriceMinor).toBe(205000);
    expect(fixedComboInputSchema.safeParse(input).success).toBe(true);
    expect(oneProductForm(f)).toBe(false);
    expect(oneProductForm({ ...f, items: [{ ...f.items[0]!, quantity: 3 }] })).toBe(true);
    const back = formFromView({ ...input, type: input.type ?? 'FIXED_SET', autoApply: input.autoApply ?? false, sameColour: input.sameColour ?? false, setPriceMinor: input.setPriceMinor ?? null, nameBn: null, descriptionEn: null, descriptionBn: null, isFeatured: false, startsOn: null, endsOn: null, items: input.items.map((i) => ({ productId: i.productId ?? null, colourIds: i.colourIds ?? [], sizeIds: [], fixedVariantId: null, quantity: i.quantity ?? 1, labelEn: null, labelBn: null })) });
    expect(back.price).toBe('2050');
    expect(back.items).toHaveLength(2);
    expect(slugify('  Crew Tee — Trio! ')).toBe('crew-tee-trio');
    expect(nameIn('bn', 'Set', 'সেট')).toBe('সেট');
    expect(nameIn('bn', 'Set', null)).toBe('Set');
    expect(nameIn('en', 'Set', 'সেট')).toBe('Set');
  });
});
