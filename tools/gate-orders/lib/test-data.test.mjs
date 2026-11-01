// Tests for the gate runs' test data (PR 414 follow-up, CN-013 phase 2): sample data only, every place a real one of
// the shipped gazetteer, enough addresses for every order of a run, and phone numbers that are made, never written.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { localPhone } from './compare.mjs';
import { addressBook, coverage, DATA, PHONE_FORMATS, seedOf, testName, testPhone, toBengaliDigits, toLatinDigits, typedPhone } from './test-data.mjs';

const raw = readFileSync(new URL('../data/test-data.json', import.meta.url), 'utf8');
const gazetteer = new Map(
  readFileSync(new URL('../../../packages/delivery/data/gazetteer-sample.csv', import.meta.url), 'utf8')
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((l) => l.split(','))
    .map(([code, level]) => [code, level]),
);

it('every district and place of the test addresses is in the shipped gazetteer', () => {
  for (const a of DATA.addresses) {
    expect(gazetteer.get(a.expect.district), `${a.id} district`).toBe('DISTRICT');
    expect(a.expect.district.startsWith(`bd.${a.division}.`), `${a.id} division`).toBe(true);
    for (const p of a.expect.places ?? []) {
      expect(gazetteer.has(p), `${a.id} ${p}`).toBe(true);
      expect(p.startsWith(`${a.expect.district}.`), `${a.id} ${p} in its district`).toBe(true);
    }
  }
});

it('covers Dhaka and its areas, the suburbs and 12+ districts outside Dhaka in all 8 divisions, with the awkward inputs', () => {
  const c = coverage(DATA.addresses);
  const divisions = [...gazetteer].filter(([, level]) => level === 'DIVISION').map(([code]) => code.split('.')[1]);
  expect(c.divisions.sort()).toEqual(divisions.sort());
  expect(divisions).toHaveLength(8);
  expect(c.outsideDistricts.length).toBeGreaterThanOrEqual(DATA.coverageGoal.outsideDistricts);
  expect(DATA.addresses.filter((a) => a.kind === 'dhaka').length).toBeGreaterThanOrEqual(10);
  expect(DATA.addresses.filter((a) => a.kind === 'suburb').length).toBeGreaterThanOrEqual(4);
  for (const q of ['bengali', 'mixed', 'long', 'pasted', 'missingThana']) expect(DATA.addresses.some((a) => a.quirk === q), q).toBe(true);
  expect(DATA.addresses.find((a) => a.quirk === 'pasted').text).toContain('\n');
  for (const a of DATA.addresses.filter((x) => x.expect.places === null)) expect(a.pick, `${a.id} pick`).toBeTruthy();
});

it('has a different address for every order of a full run, and hands each out once', () => {
  const ids = DATA.addresses.map((a) => a.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(DATA.addresses.map((a) => a.text)).size).toBe(ids.length);
  // the full run places about 30 orders (scenario 7 alone places 8)
  expect(ids.length).toBeGreaterThanOrEqual(36);
  const book = addressBook();
  const got = [book.take('dhaka'), book.take('outside'), book.take('suburb'), book.take('dhk-gulshan'), book.take((a) => a.quirk === 'bengali')];
  expect(new Set(got.map((a) => a.id)).size).toBe(5);
  expect(book.used()).toHaveLength(5);
  expect(() => book.take('dhk-gulshan')).toThrow(/no unused/);
  expect(book.left()).toBe(ids.length - 5);
});

it("spreads the run's outside-Dhaka orders over the country: all 8 divisions and 12+ districts from 12 orders", () => {
  // a full run places 12 or more orders outside Dhaka (scenarios 3, 4, 5, 7 ×5, 9, 11, 12, 13, 18)
  const book = addressBook();
  const out = Array.from({ length: 12 }, () => book.take('outside'));
  const c = coverage(out);
  expect(c.divisions).toHaveLength(DATA.coverageGoal.divisions);
  expect(c.outsideDistricts.length).toBeGreaterThanOrEqual(DATA.coverageGoal.outsideDistricts);
});

it('is sample data only: every product, colour, size, shelf and name carries the GATE TEST mark', () => {
  expect(DATA.marker).toBe('GATE TEST');
  for (const p of DATA.products) {
    expect(p.nameEn).toContain(DATA.marker);
    expect(p.slug.startsWith(DATA.slugPrefix)).toBe(true);
    for (const c of p.colours) expect(DATA.colours.some((x) => x.key === c)).toBe(true);
    for (const s of p.sizes) expect(DATA.sizes.some((x) => x.key === s)).toBe(true);
  }
  const variants = DATA.products.reduce((n, p) => n + p.colours.length * p.sizes.length, 0);
  expect(variants).toBeGreaterThanOrEqual(8);
  for (const c of DATA.colours) expect(c.nameEn).toContain(DATA.marker);
  expect(DATA.warehouse.name).toContain(DATA.marker);
  for (const n of [...DATA.names.en]) expect(n).toContain(DATA.marker);
  // the 2.1 kg parcel is made of whole pieces of one product
  expect(DATA.weightCheckGrams % DATA.products.find((p) => p.key === 'polo').weightGrams).toBe(0);
});

it('makes test phone numbers (never written in the file) in every way a customer types them', () => {
  expect(raw).not.toMatch(/(\+?880|0)1[3-9]\d{8}/);
  const seen = new Set();
  for (let n = 1; n <= 40; n++) {
    const p = testPhone(seedOf('20261101-0800'), n);
    expect(p).toMatch(/^01[3-9]\d{8}$/);
    seen.add(p);
    for (const f of PHONE_FORMATS) expect(localPhone(typedPhone(p, f)), `${p} ${f}`).toBe(p);
  }
  expect(seen.size).toBe(40);
  expect(typedPhone('01X', 'bengali')).toBe('০১X');
  expect(toLatinDigits(toBengaliDigits('0123456789'))).toBe('0123456789');
  expect(testName(1, 'bn')).toMatch(/[ঀ-৿]/);
  expect(seedOf('abc')).toBe(0);
});
