// S06 · PR 163 — the Repeat refusers card's data: every word in both admin languages, the rows shown the local way (the
// phone, the counts, who chose the terms and when, an end's who and why), the number box read as the setting (empty is
// "not set"; only a whole number from 1), the timeline line of an order with terms, its chip, and the order page's
// proposal line naming the owner's terms rather than the risk level.
import { describe, expect, it } from 'vitest';
import type { AdvanceRequestView, RefusersView } from '@extas/orders';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import { advanceSpecs } from './advance';
import { flagChips } from './list';
import { refusersCardScreen, refusersCardTexts, refuserSummary } from './refusers-card';
import { minRefusedOf, REFUSER_TERM_CHOICES, sameRefusers } from './refusers-draft';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const VIEW: RefusersView = {
  value: { enabled: false, minRefused: 2 },
  candidates: [{ phone: '+8801700000701', refused: 2, delivered: 1, orders: 4, lastAt: '2026-10-30T06:00:00.000Z', termId: 't1', terms: 'codOff' }],
  active: [{ id: 't1', phone: '+8801700000701', terms: 'codOff', reason: 'refused twice', refusedAtDecision: 2, identity: true, decidedAt: '2026-10-31T04:00:00.000Z', decidedBy: 'Sample owner', endedAt: null, endedBy: null, endReason: null }],
  ended: [{ id: 't0', phone: '+8801700000701', terms: 'delivery', reason: 'refused once', refusedAtDecision: 1, identity: false, decidedAt: '2026-10-29T04:00:00.000Z', decidedBy: null, endedAt: '2026-10-31T04:00:00.000Z', endedBy: 'Sample owner', endReason: 'refused again' }],
  reasonLimits: { min: 5, max: 500 },
};

describe('PR 163 · the Repeat refusers card', () => {
  it('every word in both languages', () => {
    for (const lang of ['en', 'bn'] as const) {
      const x = refusersCardTexts(view(lang));
      for (const [k, v] of Object.entries(x)) {
        if (typeof v === 'string') expect(v, `${lang} ${k}`).not.toMatch(/^orders\./);
        else for (const [k2, v2] of Object.entries(v)) expect(v2, `${lang} ${k}.${k2}`).not.toMatch(/^orders\./);
      }
      expect(Object.keys(x.terms)).toEqual([...REFUSER_TERM_CHOICES]);
      for (const k of ['ev.order_refuserTerms', 'ev.refuserCount', 'ev.refuserWhy', 'ev.refuserProposal', 'flag.refuser', 'adv.proposedRefuser']) expect(t(adminDicts[lang], `orders.${k}`), `${lang} ${k}`).not.toBe(`orders.${k}`);
    }
  });

  it('rows the local way: the phone, the counts, the last day, who chose the terms and when, an end with who and why', () => {
    const s = refusersCardScreen(view('en'), VIEW);
    expect(s.candidates[0]).toMatchObject({ phone: expect.stringMatching(/^01700/), raw: '+8801700000701', refused: 2, delivered: 1, orders: 4, terms: 'codOff' });
    expect(s.candidates[0]!.last).toMatch(/2026/);
    expect(s.active[0]).toMatchObject({ terms: 'codOff', who: 'Sample owner', identity: true, endedWho: null });
    expect(s.active[0]!.when).toMatch(/10:00/);
    expect(s.ended[0]).toMatchObject({ who: t(adminDicts.en, 'orders.who.staff'), endedWho: 'Sample owner', endReason: 'refused again' });
    expect(s.reasonLimits).toEqual({ min: 5, max: 500 });
  });

  it('the number box: empty is not set, only a whole number from 1', () => {
    expect(minRefusedOf('')).toEqual({ ok: true, value: null });
    expect(minRefusedOf(' 3 ')).toEqual({ ok: true, value: 3 });
    for (const bad of ['0', '-1', '2.5', 'two']) expect(minRefusedOf(bad), bad).toEqual({ ok: false });
    expect(sameRefusers({ enabled: false, minRefused: null }, { enabled: false, minRefused: null })).toBe(true);
    expect(sameRefusers({ enabled: false, minRefused: null }, { enabled: false, minRefused: 2 })).toBe(false);
  });

  it('the timeline line names the terms, the refusals then, why, and that a person sends it', () => {
    expect(refuserSummary(view('en'), { terms: 'codOff', via: 'identity', reason: 'refused twice', refused: 2 })).toBe('No cash on delivery for this number · 2 refusals when chosen · because: refused twice · the same person under another number · a proposal — a person sends it');
    expect(refuserSummary(view('en'), null)).toBe('a proposal — a person sends it');
  });

  it('a "Repeat refuser" chip on the order lists', () => {
    const chips = flagChips(view('en'), { cancelRequested: false, inReview: false, status: 'PLACED', holdReasonCode: null, customerWantsChange: false, flags: ['REPEAT_REFUSER'], orderGroupId: null, internalFlags: [], source: 'WEBSITE' } as unknown as Parameters<typeof flagChips>[1], { holdReasons: new Map(), flags: new Map() });
    expect(chips).toContainEqual({ label: 'Repeat refuser', tone: 'warn' });
  });

  it('the order page says the owner\'s terms propose it, not the risk level', () => {
    const adv = { amounts: { delivery: { ok: true, amountMinor: 12_000 }, partial: { ok: false, code: 'PARTIAL_UNSET' }, full: { ok: true, amountMinor: 250_000 }, codOff: { ok: true, amountMinor: 250_000 } }, proposed: 'codOff', proposedBy: 'refuser', defaultKind: 'codOff', channels: ['SMS'], messagesOn: false, provider: 'bkash', waitHours: 24, auto: false, currency: 'BDT', link: null } as unknown as AdvanceRequestView;
    const o = { id: '01a16af2-30f0-7462-aab8-719bb3ce5542', number: 'S-1042', version: 3, currency: 'BDT' };
    const spec = advanceSpecs(view('en'), o, adv, ['awaitAdvance'], new Set(['orders.advance.request'])).request!;
    expect(spec.sub).toMatch(/^Your terms for this number propose/);
  });
});
