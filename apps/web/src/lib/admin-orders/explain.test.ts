// PR 566 — the support explanation panel's words: every reason code has its words in both admin languages, amounts are
// money, the team-only reasons are marked and never reach the words for the customer, the risk line follows the
// setting, and the words for the customer are filled in Bengali and in English from the owner's lines.
import { describe, expect, it } from 'vitest';
import { explainOf, type ExplainFacts } from '@extas/orders';
import { registry } from '@extas/settings';
import bn from '../../../messages/admin-support.bn.json';
import en from '../../../messages/admin-support.en.json';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { keysOf } from '../shop/dict';
import { explainView, sayText } from './explain';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const S = registry['orders.explain'].default;

const FACTS: ExplainFacts = {
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
  advanceRequirement: 'DELIVERY_CHARGE',
  advanceRequiredMinor: null,
  advanceDueAt: null,
  addressUnclear: false,
  chargeFixed: true,
  addressResolution: { status: 'resolved', via: 'line', placeSure: true, charge: { state: 'charge', chargeMinor: 6_000 } },
  riskScore: null,
  riskBand: null,
  band: { nameEn: 'Inside Dhaka', nameBn: 'ঢাকার ভেতরে', chargeMinor: 6_000, codLimitMinor: null },
  area: { nameEn: 'Dhanmondi', nameBn: 'ধানমন্ডি' },
  placed: { codOff: null },
  asks: [],
  flag: { requirement: 'DELIVERY_CHARGE', layer: 'Test layer' },
  risk: { score: 61, band: 'soft' },
};
const both = (f: ExplainFacts) => ({ en: explainOf(f, 'en'), bn: explainOf(f, 'bn') });

describe('PR 566 · the support explanation panel', () => {
  it('both languages carry the same words', () => {
    expect(keysOf(bn).sort()).toEqual(keysOf(en).sort());
  });

  it('every reason code the explanation can give has its words', () => {
    const codes = ['none', 'chosePrepaid', 'layer', 'checkoutRule', 'gift', 'giftPart', 'codOffBand', 'codOffRule', 'codOffShop', 'asked', 'level', 'deliveryNotFull', 'fullNotDelivery', 'risk', 'paidSoFar', 'paidAll', 'dueBy', 'noRecord'];
    const charge = ['band', 'viaLine', 'viaLineNoPlace', 'viaChoice', 'viaSaved', 'placeUnsure', 'backfill', 'bandNow', 'detailCheck', 'freeOver', 'freeCampaign', 'freeProducts', 'freePrepaid', 'exempt', 'unclear', 'notSet', 'notSetNoBand', 'pickup'];
    for (const lang of ['en', 'bn'] as const) for (const c of [...codes, ...charge]) expect(adminDicts[lang], `${lang} ${c}`).toHaveProperty(['support', 'explain', 'why', c]);
  });

  it('the headline, the reasons with the team-only ones marked, and the words for the customer in both languages', () => {
    const v = explainView(view('en'), S, both(FACTS));
    expect(v.advance).toMatchObject({ value: 'Delivery charge ahead · ৳60', tone: 'warn' });
    expect(v.charge.value).toBe('৳60 · Inside Dhaka');
    expect(v.whyAdvance.rows.map((r) => [r.code, r.teamOnly])).toEqual([
      ['layer', true],
      ['deliveryNotFull', true],
      ['risk', true],
      ['paidSoFar', false],
    ]);
    expect(v.whyAdvance.rows[0]?.text).toContain('"Test layer"');
    expect(v.whyAdvance.rows[3]?.text).toBe('Paid so far: ৳0 of ৳60.');
    expect(v.say.lines.map((l) => l.lang)).toEqual(['bn', 'en']);
    const said = v.say.lines.find((l) => l.lang === 'en')!.text;
    expect(said).toBe('For this order we take only the delivery charge, ৳60, in advance. The rest you pay when the parcel arrives. Your address is in our Inside Dhaka delivery area, so the delivery charge is ৳60.');
    // the customer never hears the rule's name, the score or the level
    for (const l of v.say.lines) for (const secret of ['Test layer', '61', 'soft']) expect(l.text).not.toContain(secret);
    expect(v.say.lines.find((l) => l.lang === 'bn')!.text).toContain('ঢাকার ভেতরে');
  });

  it('the risk line follows `showRisk`; nothing to say shows the empty line', () => {
    expect(explainView(view('bn'), { ...S, showRisk: false }, both(FACTS)).whyAdvance.rows.map((r) => r.code)).not.toContain('risk');
    const pickup = explainView(view('en'), S, both({ ...FACTS, advanceRequirement: 'NONE', flag: null, risk: null, fulfillmentType: 'PICKUP' }));
    expect(pickup.say.lines).toEqual([]);
    expect(pickup.advance.tone).toBe('info');
  });

  it("the owner's own words win, with the amounts filled in", () => {
    const own = { ...S, say: { ...S.say, chargeFree: { en: 'Free for you, always.', bn: 'আপনার জন্য ফ্রি।' } } };
    expect(sayText([null, { key: 'chargeFree', values: {} }], own, 'en', 'BDT')).toBe('Free for you, always.');
    expect(sayText([{ key: 'advancePart', values: { amount: 50_000, paid: 0 } }], S, 'en', 'BDT')).toContain('৳500');
  });
});
