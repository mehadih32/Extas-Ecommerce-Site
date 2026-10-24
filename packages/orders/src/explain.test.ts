// PR 566 — the support explanation from stored facts, without a database: the advance (delivery charge rather than the
// full amount, the full amount, a part, a gift, Cash on Delivery off at checkout, none) and the delivery charge (the
// band's charge as shown, free and why, an address nothing settled, a band with no charge). Made-up values only.
import { describe, expect, it } from 'vitest';
import { explainOf, type ExplainFacts } from './explain';

const BASE: ExplainFacts = {
  number: 'T-1001',
  currency: 'BDT',
  fulfillmentType: 'DELIVERY',
  isGift: false,
  flags: [],
  totalMinor: 160_000,
  walletAppliedMinor: 0,
  deliveryChargeMinor: 6_000,
  paidMinor: 0,
  paymentMethod: 'COD',
  advanceRequirement: 'NONE',
  advanceRequiredMinor: null,
  advanceDueAt: null,
  addressUnclear: false,
  chargeFixed: true,
  addressResolution: {
    status: 'resolved',
    via: 'line',
    placeSure: true,
    band: 'dhaka-city',
    charged: 'dhaka-city',
    charge: { state: 'charge', chargeMinor: 6_000 },
    detail: true,
  },
  riskScore: null,
  riskBand: null,
  band: {
    nameEn: 'Inside Dhaka',
    nameBn: 'ঢাকার ভেতরে',
    chargeMinor: 6_000,
    codLimitMinor: 500_000,
  },
  area: { nameEn: 'Dhanmondi', nameBn: 'ধানমন্ডি' },
  placed: { payment: { method: 'cod', option: null }, codOff: null },
  asks: [],
  flag: null,
  risk: null,
};
const f = (o: Partial<ExplainFacts>): ExplainFacts => ({ ...BASE, ...o });
const codes = (lines: { code: string }[]) => lines.map((l) => l.code);

describe('PR 566 · why an advance', () => {
  it('no advance: Cash on Delivery, nothing asked, no words to read out', () => {
    const e = explainOf(BASE);
    expect(e.advance).toMatchObject({
      kind: 'none',
      amountMinor: null,
      say: null,
    });
    expect(codes(e.advance.why)).toEqual(['none']);
  });

  it('a customer who chose to pay online was not asked for an advance', () => {
    const e = explainOf(
      f({
        paymentMethod: 'BKASH',
        placed: {
          payment: { method: 'mobile', option: 'bkash' },
          codOff: null,
        },
      }),
    );
    expect(e.advance.kind).toBe('none');
    expect(codes(e.advance.why)).toEqual(['chosePrepaid']);
  });

  it('the checkout layer asked for the delivery charge: why the charge and not the full amount, the layer for the team only', () => {
    const e = explainOf(
      f({
        advanceRequirement: 'DELIVERY_CHARGE',
        flag: {
          requirement: 'DELIVERY_CHARGE',
          layer: 'New number, outside Dhaka',
        },
        risk: { score: 62, band: 'soft' },
      }),
    );
    expect(e.advance).toMatchObject({ kind: 'delivery', amountMinor: 6_000 });
    expect(codes(e.advance.why)).toEqual(['layer', 'deliveryNotFull', 'risk', 'paidSoFar']);
    expect(e.advance.why.filter((w) => w.staffOnly).map((w) => w.code)).toEqual(['layer', 'deliveryNotFull', 'risk']);
    // the words for the customer carry only the amount — never the layer, the score or the level
    expect(e.advance.say).toEqual({
      key: 'advanceDelivery',
      values: { amount: 6_000, paid: 0 },
    });
  });

  it('the full amount: the stricter level, paid in full shows as paid', () => {
    const e = explainOf(
      f({
        advanceRequirement: 'FULL_AMOUNT',
        paidMinor: 160_000,
        flag: { requirement: 'FULL_AMOUNT', layer: 'Past returns' },
      }),
    );
    expect(e.advance).toMatchObject({ kind: 'full', amountMinor: 160_000 });
    expect(codes(e.advance.why)).toEqual(['layer', 'fullNotDelivery', 'paidAll']);
    expect(e.advance.say?.key).toBe('advanceFull');
  });

  it('the team asked through the order service: the amount, who, when, the level (team only) and the deadline', () => {
    const at = new Date('2026-10-24T05:00:00Z');
    const due = new Date('2026-10-25T05:00:00Z');
    const e = explainOf(
      f({
        advanceRequiredMinor: 6_000,
        advanceDueAt: due,
        paidMinor: 2_000,
        asks: [
          {
            at,
            requiredMinor: 6_000,
            level: 'soft',
            by: 'Nadia',
            actor: 'STAFF',
          },
        ],
      }),
    );
    expect(e.advance.kind).toBe('delivery');
    expect(e.advance.why).toEqual([
      {
        code: 'asked',
        values: { amount: 6_000, by: 'Nadia', actor: 'STAFF', at },
      },
      { code: 'level', values: { level: 'soft' }, staffOnly: true },
      { code: 'deliveryNotFull', staffOnly: false },
      { code: 'paidSoFar', values: { paid: 2_000, amount: 6_000 } },
      { code: 'dueBy', values: { at: due } },
    ]);
    expect(e.advance.say).toEqual({
      key: 'advanceDelivery',
      values: { amount: 6_000, paid: 2_000 },
    });
  });

  it('a part that is neither the charge nor the whole amount', () => {
    const e = explainOf(
      f({
        advanceRequiredMinor: 50_000,
        asks: [
          {
            at: new Date(0),
            requiredMinor: 50_000,
            level: null,
            by: null,
            actor: 'SYSTEM',
          },
        ],
      }),
    );
    expect(e.advance).toMatchObject({ kind: 'part', amountMinor: 50_000 });
    expect(e.advance.say?.key).toBe('advancePart');
  });

  it('a gift paid ahead in full (Cash on Delivery off for the gift), and a gift with a part ahead', () => {
    const full = explainOf(
      f({
        isGift: true,
        paymentMethod: 'BKASH',
        placed: {
          payment: { method: 'mobile' },
          codOff: 'GIFT',
          gift: { advance: 'full', partMinor: null },
        },
      }),
    );
    expect(full.advance).toMatchObject({ kind: 'full', amountMinor: 160_000 });
    expect(codes(full.advance.why)).toEqual(['gift', 'paidSoFar']);
    expect(full.advance.say?.key).toBe('advanceGift');
    const part = explainOf(
      f({
        isGift: true,
        flags: ['GIFT_ADVANCE'],
        advanceRequiredMinor: 40_000,
        placed: { codOff: null, gift: { advance: 'part', partMinor: 40_000 } },
      }),
    );
    expect(part.advance).toMatchObject({ kind: 'part', amountMinor: 40_000 });
    expect(part.advance.why[0]).toEqual({ code: 'giftPart' });
    expect(part.advance.say?.key).toBe('advanceGift');
  });

  it("Cash on Delivery off at checkout: the band's COD limit, a Smart Rule, the shop's switch", () => {
    const band = explainOf(f({ paymentMethod: 'BKASH', placed: { codOff: 'BAND_LIMIT' } }));
    expect(band.advance.kind).toBe('full');
    expect(band.advance.why[0]).toEqual({
      code: 'codOffBand',
      values: { band: 'Inside Dhaka', limit: 500_000 },
    });
    expect(band.advance.say?.key).toBe('codOff');
    expect(explainOf(f({ paymentMethod: 'CARD', placed: { codOff: 'RULE' } })).advance.why[0]?.code).toBe('codOffRule');
    expect(explainOf(f({ paymentMethod: 'NAGAD', placed: { codOff: 'OFF' } })).advance.why[0]?.code).toBe('codOffShop');
  });

  it('an advance with no stored reason says so instead of guessing', () => {
    const e = explainOf(f({ advanceRequiredMinor: 6_000 }));
    expect(codes(e.advance.why)[0]).toBe('noRecord');
  });
});

describe('PR 566 · why this delivery charge', () => {
  it("the band's charge as the customer was shown it, the place it was read as, in the admin's language", () => {
    const e = explainOf(BASE, 'bn');
    expect(e.charge).toMatchObject({ state: 'charge', amountMinor: 6_000 });
    expect(e.charge.why).toEqual([
      { code: 'band', values: { band: 'ঢাকার ভেতরে', charge: 6_000 } },
      { code: 'viaLine', values: { area: 'ধানমন্ডি' } },
    ]);
    expect(e.charge.say).toEqual({
      key: 'chargeBand',
      values: { charge: 6_000, band: 'ঢাকার ভেতরে', area: 'ধানমন্ডি' },
    });
  });

  it('SIM-F-003: the order keeps the charge it showed even when the band charges something else today', () => {
    const e = explainOf(f({ band: { ...BASE.band!, chargeMinor: 7_000 } }));
    expect(e.charge.amountMinor).toBe(6_000);
    expect(e.charge.why).toContainEqual({
      code: 'bandNow',
      values: { now: 7_000, charge: 6_000 },
    });
  });

  it('picked by the customer, or settled silently from the address the shop holds (PR 561)', () => {
    const r = BASE.addressResolution as Record<string, unknown>;
    expect(codes(explainOf(f({ addressResolution: { ...r, via: 'choice', placeSure: false } })).charge.why)).toEqual(['band', 'viaChoice', 'placeUnsure']);
    expect(codes(explainOf(f({ addressResolution: { ...r, via: 'saved', backfill: 'saved' } })).charge.why)).toEqual(['band', 'viaSaved', 'backfill']);
  });

  it('free delivery and why (PR 565): over the amount, by a campaign, for prepaid', () => {
    const over = explainOf(
      f({
        deliveryChargeMinor: 0,
        addressResolution: {
          status: 'resolved',
          charge: {
            state: 'free',
            reason: 'FREE_OVER',
            freeOverMinor: 150_000,
          },
          bandExempt: true,
        },
      }),
    );
    expect(over.charge).toMatchObject({ state: 'free', amountMinor: 0 });
    expect(over.charge.why).toEqual([{ code: 'freeOver', values: { over: 150_000 } }, { code: 'exempt' }]);
    expect(over.charge.say).toEqual({
      key: 'chargeFreeOver',
      values: { over: 150_000 },
    });
    expect(
      explainOf(
        f({
          addressResolution: {
            charge: {
              state: 'free',
              reason: 'FREE_CAMPAIGN',
              freeOverMinor: null,
            },
          },
        }),
      ).charge.say?.key,
    ).toBe('chargeFree');
    expect(
      explainOf(
        f({
          addressResolution: {
            charge: { state: 'free', reason: 'PREPAID', freeOverMinor: null },
          },
        }),
      ).charge.say?.key,
    ).toBe('chargePrepaid');
  });

  it('PR 563: an address nothing settled, or a band with no charge yet — the charge is confirmed on the call', () => {
    const unclear = explainOf(
      f({
        addressUnclear: true,
        chargeFixed: false,
        deliveryChargeMinor: 0,
        band: null,
        area: null,
        addressResolution: {
          status: 'ask',
          reason: 'two-places',
          charge: { state: 'unknown' },
        },
      }),
    );
    expect(unclear.charge).toMatchObject({
      state: 'unclear',
      why: [{ code: 'unclear', values: { reason: 'two-places' } }],
    });
    expect(unclear.charge.say?.key).toBe('chargeNotFixed');
    const notSet = explainOf(
      f({
        chargeFixed: false,
        deliveryChargeMinor: 0,
        addressResolution: {
          status: 'resolved',
          via: 'line',
          charge: { state: 'not-set' },
        },
      }),
    );
    expect(notSet.charge).toMatchObject({
      state: 'not-set',
      why: [{ code: 'notSet', values: { band: 'Inside Dhaka' } }],
    });
    // an order with no band at all (the sample order) is told without an empty band name
    expect(explainOf(f({ chargeFixed: false, deliveryChargeMinor: 0, band: null })).charge.why).toEqual([{ code: 'notSetNoBand' }]);
  });

  it('a showroom order has no delivery charge to explain', () => {
    expect(explainOf(f({ fulfillmentType: 'PICKUP' })).charge).toMatchObject({
      state: 'pickup',
      say: null,
    });
  });
});
