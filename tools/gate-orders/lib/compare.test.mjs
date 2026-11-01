// Tests for the address round trip of the gate's test orders (PR 414 follow-up, CN-013 phase 2).
import { expect, it } from 'vitest';
import { addressDiffs, diffLine, localPhone, placeFails, placeVerdict, plainText } from './compare.mjs';
import { PHONE_FORMATS, testPhone, typedPhone } from './test-data.mjs';

const phone = testPhone(4242, 3);
const typed = { name: 'GATE TEST Rahim', phone, address: 'Flat 5A\nHouse 120, Khilgaon Taltola\nDhaka 1219' };
const same = { name: typed.name, phone: `+88${phone}`, address: 'Flat 5A House 120, Khilgaon Taltola Dhaka 1219' };

it('a phone number is the same number in every way a customer types it', () => {
  for (const f of PHONE_FORMATS) expect(localPhone(typedPhone(phone, f))).toBe(phone);
  expect(localPhone(`+88${phone}`)).toBe(phone);
  expect(localPhone(`0088${phone}`)).toBe(phone);
  expect(localPhone(phone.slice(1))).toBe(phone);
  expect(localPhone('12345')).toBeNull();
  expect(localPhone(null)).toBeNull();
});

it('only spacing is forgiven: a pasted address with line breaks arrives as one line', () => {
  expect(plainText('  a\n\n b\t c ')).toBe('a b c');
  expect(addressDiffs(typed, { stored: same, admin: same, courier: same, sticker: same })).toEqual([]);
});

it('a changed word, digit or letter at any stage is a difference', () => {
  const diffs = addressDiffs(typed, { stored: same, admin: { ...same, address: 'Flat 5A House 12, Khilgaon Taltola Dhaka 1219' }, courier: { ...same, phone: '01700000000' }, sticker: { ...same, name: 'GATE TEST Rahim.' } });
  expect(diffs.map((d) => `${d.stage}.${d.field}`)).toEqual(['admin.address', 'courier.phone', 'sticker.name']);
  expect(diffLine(diffs[0])).toMatch(/^admin\.address: typed "Flat 5A House 120/);
});

it('Bengali text must arrive letter for letter', () => {
  const bn = { name: 'গেট টেস্ট রহিম', phone, address: 'বাড়ি ১৫, রোড ৩, মোহাম্মদপুর, ঢাকা' };
  expect(addressDiffs(bn, { stored: bn })).toEqual([]);
  expect(addressDiffs(bn, { stored: { ...bn, address: 'বাড়ি 15, রোড 3, মোহাম্মদপুর, ঢাকা' } })).toHaveLength(1);
  // the same letters in another Unicode form (NFD) are the same text
  expect(addressDiffs(bn, { stored: { ...bn, address: bn.address.normalize('NFD') } })).toEqual([]);
});

it('a stage not reached is skipped; a stage reached without a field is a difference', () => {
  expect(addressDiffs(typed, { stored: same, admin: null, courier: undefined })).toEqual([]);
  expect(addressDiffs(typed, { stored: { ...same, address: null } }).map((d) => d.field)).toEqual(['address']);
});

it("with the owner's backfill, the parcel goes to the shop's full address while the order keeps what he typed", () => {
  const full = 'Flat 5A, House 120, Khilgaon Taltola, Dhaka 1219';
  const parcel = { ...same, address: full };
  expect(addressDiffs(typed, { stored: same, admin: same, courier: parcel, sticker: parcel }, { backfilled: full })).toEqual([]);
  expect(addressDiffs(typed, { stored: same, courier: same }, { backfilled: full }).map((d) => `${d.stage}.${d.field}`)).toEqual(['courier.address']);
});

it("reads how the shop placed the address against the test data's expectation", () => {
  const expect1 = { district: 'bd.dhaka.dhaka', places: ['bd.dhaka.dhaka.dhanmondi'] };
  expect(placeVerdict(expect1, 'bd.dhaka.dhaka.dhanmondi')).toBe('OK');
  expect(placeVerdict(expect1, 'bd.dhaka.dhaka.dhanmondi.road-7')).toBe('OK');
  expect(placeVerdict(expect1, 'bd.dhaka.dhaka')).toBe('WIDER');
  expect(placeVerdict(expect1, 'bd.dhaka.dhaka.mirpur')).toBe('OTHER');
  expect(placeVerdict(expect1, 'bd.khulna.khulna.sonadanga')).toBe('WRONG');
  expect(placeVerdict(expect1, null)).toBe('UNREAD');
  expect(placeVerdict({ district: 'bd.barishal.bhola', places: null }, 'bd.barishal.bhola.char-fasson')).toBe('OK');
  expect(['OK', 'WIDER', 'OTHER', 'UNREAD'].some(placeFails)).toBe(false);
  expect(placeFails('WRONG')).toBe(true);
});
