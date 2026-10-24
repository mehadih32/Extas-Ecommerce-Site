// S06 · PR 521 — the alert summary's words: every rule, action, source and line has words in both admin languages; the
// summary says why (rules with how sure, window and proposal; the look-back; the risk signals), what matched, what the
// rider wrote, his history and the options with the proposed one first; the duplicate check's timeline line.
import { describe, expect, it } from 'vitest';
import type { AlertSummary } from '@extas/orders';
import { DUPLICATE_SCENARIOS, RULE_ACTIONS } from '@extas/settings';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import { alertExplainView, duplicateCheckSummary, ruleText, windowText } from './alert';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const zero = { orders: 0, delivered: 0, refused: 0, ourFault: 0, cancelled: 0, cancelsCounted: 0, returns: 0, open: 0, inTransit: 0, noAnswer: 0, firstAt: null, lastAt: null };
const fmt = { money: (n: number) => `৳${n / 100}`, date: () => '24 Oct' };

function sample(over: Partial<AlertSummary> = {}): AlertSummary {
  return {
    alertId: 'a1',
    orderId: 'o2',
    number: '1002',
    status: 'OPEN',
    kind: 'duplicate',
    section: 'duplicate',
    severity: 'high',
    confidence: 100,
    proposedAction: 'CANCEL',
    proposed: 'decline',
    because: [],
    rules: [{ rule: 'A', confidence: 100, action: 'cancel', suggest: 'cancel', matches: [{ orderId: 'o1', number: '1001', confidence: 100 }], blocked: [], values: { windowMinutes: 7200, minConfidence: 60 } }],
    afterEdit: false,
    matches: [{ orderId: 'o1', number: '1001', status: 'PLACED', placedAt: new Date(), totalMinor: 150_000, severity: 'high', rules: ['A'], via: ['phone'] }],
    riderNotes: [{ orderId: 'o0', number: '0990', at: new Date(), note: 'Did not pick up', from: 'courier', reasonCode: null }],
    history: { phone: { ...zero, orders: 2, delivered: 1 }, identity: null, otherPhones: 0 },
    options: ['decline', 'approve', 'hold', 'ask', 'merge'],
    createdAt: new Date(),
    decidedAt: null,
    decisionReason: null,
    ...over,
  };
}

describe('PR 521 · the alert summary words', () => {
  it('every rule, action, source and line has words in both languages', () => {
    for (const lang of ['en', 'bn'] as const) {
      const d = adminDicts[lang];
      const keys = [
        ...DUPLICATE_SCENARIOS.map((r) => `orders.alert.rule.${r}`),
        ...RULE_ACTIONS.map((a) => `orders.alert.action.${a}`),
        ...['phone', 'customer', 'identity', 'address'].map((h) => `orders.alert.how.${h}`),
        ...['courier', 'return'].map((s) => `orders.alert.from.${s}`),
        ...['label', 'why', 'fired', 'noneFired', 'sure', 'within', 'anyTime', 'minutes', 'hours', 'days', 'pieces', 'proposes', 'lookback', 'signals', 'noWhy', 'matched', 'alike', 'byRules', 'noMatch', 'rider', 'noRider', 'history', 'phone', 'identity', 'proposed', 'options', 'decided', 'noRights', 'yours'].map((k) => `orders.alert.${k}`),
      ];
      for (const k of keys) expect(t(d, k), `${lang} ${k}`).not.toBe(k);
    }
  });

  it('a rule in words: its name, how sure, its window, the pieces or the block, and what it proposes', () => {
    const v = view('en');
    expect(windowText(v, 7200)).toBe('within 5 days');
    expect(windowText(v, 180)).toBe('within 3 hours');
    expect(windowText(v, 45)).toBe('within 45 minutes');
    expect(windowText(v, 0)).toBe('any time');
    expect(ruleText(v, { rule: 'A', confidence: 100, action: 'cancel', values: { windowMinutes: 7200 } })).toBe('A · Same customer, same items again · 100% sure · within 5 days · proposes cancel');
    expect(ruleText(v, { rule: 'I', confidence: 100, action: 'warn', values: { windowMinutes: 0, pieces: 12, atLeast: 10 } })).toBe('I · Bulk-looking order · 100% sure · any time · 12 pieces (from 10) · proposes a note');
    expect(ruleText(v, { rule: 'H', confidence: 90, action: 'hold', values: { how: 'address,identity' } })).toContain('blocked address · blocked identity');
  });

  it('the summary: why, what matched, the rider, his history, the proposed decision first', () => {
    const e = alertExplainView(view('en'), sample(), fmt);
    expect(e.why).toEqual(['A · Same customer, same items again · 100% sure · within 5 days · proposes cancel']);
    expect(e.matches).toEqual([expect.objectContaining({ number: '1001', href: '/admin/orders/o1', status: t(adminDicts.en, 'orders.st.PLACED') })]);
    expect(e.matches[0]!.sub).toBe('24 Oct · ৳1500 · High match · rule A · same phone');
    expect(e.riders).toEqual([expect.objectContaining({ number: '0990', text: 'Did not pick up', sub: 'courier update · 24 Oct' })]);
    expect(e.noRider).toBeNull();
    expect(e.history[0]).toMatch(/^This number: 2 other orders · 1 delivered/);
    expect(e.proposed).toBe('Proposed: Cancel as duplicate');
    expect(e.options).toBe('What you can do: Cancel as duplicate · Not a duplicate · Hold · Ask the customer · One parcel');
  });

  it('the look-back, a risk review, no match, no rider note, decided, and no right to decide', () => {
    const v = view('en');
    expect(alertExplainView(v, sample({ rules: [], matches: [], riderNotes: [] }), fmt)).toMatchObject({ why: ['Another open order of the same customer looks alike (High)'], noMatch: expect.any(String), noRider: expect.any(String) });
    const risk = alertExplainView(v, sample({ kind: 'risk', section: 'high', rules: [], because: ['refusals'], severity: null, proposed: 'hold', options: ['hold', 'approve'] }), fmt);
    expect(risk.why).toEqual([`Risk signals: ${t(adminDicts.en, 'orders.risk.sig.refusals')}`]);
    expect(risk.options).toBe('What you can do: Hold · Looks fine');
    expect(alertExplainView(v, sample({ status: 'APPROVED', options: [] }), fmt)).toMatchObject({ proposed: null, options: 'Decided: nothing left to do' });
    expect(alertExplainView(v, sample({ options: [] }), fmt).options).toBe(t(adminDicts.en, 'orders.alert.noRights'));
    expect(alertExplainView(view('bn'), sample({ history: { phone: { ...zero, orders: 3 }, identity: { ...zero, orders: 5 }, otherPhones: 2 } }), fmt).history).toHaveLength(2);
  });

  it('the duplicate check\'s timeline line when the rules ran; the look-back keeps its own', () => {
    expect(duplicateCheckSummary(view('en'), { rules: [{ rule: 'A' }, { rule: 'E' }], proposed: 'cancel' })).toBe('Rules: A · Same customer, same items again, E · Same style, another size · proposes cancel');
    expect(duplicateCheckSummary(view('en'), { rules: [], proposed: null })).toBe('No rule fired');
    expect(duplicateCheckSummary(view('en'), { matches: [] })).toBeNull();
  });
});
