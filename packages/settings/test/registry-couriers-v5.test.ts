// S28 · PR 670 (registry v310): the default courier — never owner data, labelled in both languages, empty as shipped (the
// first courier is the default until the owner picks one), a courier id or empty text.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { COURIER_MESSAGE_EVENTS, couriersV5Settings } from '../src/registry-couriers-v5';

describe('couriers setting (v310)', () => {
  it('delivery.couriers is in the registry at version 310, labelled in both languages, empty as shipped', () => {
    const spec = couriersV5Settings['delivery.couriers'];
    expect(registry['delivery.couriers']).toBe(spec);
    expect(spec.version).toBe(310);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toEqual({ defaultCourierId: '' });
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
  });
  it('the default is a courier id or empty text, nothing else', () => {
    const s = couriersV5Settings['delivery.couriers'].schema;
    expect(s.safeParse({ defaultCourierId: '3f0c2a52-6a5b-4a5f-9a53-2f4d8f0a1b11' }).success).toBe(true);
    expect(s.safeParse({ defaultCourierId: 'x' }).success).toBe(false);
    expect(s.safeParse({ defaultCourierId: '', extra: 1 }).success).toBe(false);
  });
});

describe("courier payouts setting (v311)", () => {
  it("delivery.courier.payouts ships off, labelled in both languages, with the owner's own numbers", () => {
    const spec = couriersV5Settings["delivery.courier.payouts"];
    expect(registry["delivery.courier.payouts"]).toBe(spec);
    expect(spec.version).toBe(311);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toEqual({ enabled: false, pollMinutes: 30, minAmountMinor: 0 });
    for (const lang of ["en", "bn"] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    const s = spec.schema;
    expect(s.safeParse({ enabled: true, pollMinutes: 5, minAmountMinor: 0 }).success).toBe(true);
    expect(s.safeParse({ enabled: true, pollMinutes: 4, minAmountMinor: 0 }).success).toBe(false);
    expect(s.safeParse({ enabled: true, pollMinutes: 30, minAmountMinor: -1 }).success).toBe(false);
  });
});

describe("courier claim terms setting (v312)", () => {
  it("delivery.courier.claimTerms ships off, labelled in both languages", () => {
    const spec = couriersV5Settings["delivery.courier.claimTerms"];
    expect(registry["delivery.courier.claimTerms"]).toBe(spec);
    expect(spec.version).toBe(312);
    expect(spec.default).toEqual({ deadlineEnabled: false, days: 30, warnDays: 5, postRecovered: false });
    for (const lang of ["en", "bn"] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    const s = spec.schema;
    expect(s.safeParse({ deadlineEnabled: true, days: 1, warnDays: 0, postRecovered: false }).success).toBe(true);
    expect(s.safeParse({ deadlineEnabled: true, days: 0, warnDays: 0, postRecovered: false }).success).toBe(false);
    expect(s.safeParse({ deadlineEnabled: true, days: 30, warnDays: 61, postRecovered: false }).success).toBe(false);
  });
});

describe("courier messages setting (v313)", () => {
  it("delivery.courier.messages ships off with a text in both languages for every event", () => {
    const spec = couriersV5Settings["delivery.courier.messages"];
    expect(registry["delivery.courier.messages"]).toBe(spec);
    expect(spec.version).toBe(313);
    expect(spec.default.enabled).toBe(false);
    for (const e of COURIER_MESSAGE_EVENTS) {
      expect(spec.default[e].en, e).toBeTruthy();
      expect(spec.default[e].bn, e).toBeTruthy();
    }
    for (const lang of ["en", "bn"] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
  });
  it("refuses a placeholder that is not on the list and an empty text", () => {
    const spec = couriersV5Settings["delivery.courier.messages"];
    expect(spec.schema.safeParse({ ...spec.default, hold: { en: "Hold {secret}", bn: "রাখুন" } }).success).toBe(false);
    expect(spec.schema.safeParse({ ...spec.default, hold: { en: "", bn: "রাখুন" } }).success).toBe(false);
    expect(spec.schema.safeParse({ ...spec.default, hold: { en: "x".repeat(241), bn: "রাখুন" } }).success).toBe(false);
  });
});
