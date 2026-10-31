// PR 545 — the call queue on the admin screens without a database: a waiting call (its reason, who to phone, how long,
// the dialog with the owner's outcomes), a tried one (its last outcome, the notes with the outcome's name), a made one
// (no dialog), a reader (no dialog), an unknown reason by its code, the card's outcomes in and out, and every word in
// both languages. Every value is a made-up test value.
import { describe, expect, it } from 'vitest';
import type * as od from '@extas/orders';
import { CALL_TASK_REASONS } from '@extas/orders';
import { CALL_OUTCOMES_DEFAULT } from '@extas/settings';
import { t, type Dict } from '../i18n';
import obn from '../../../messages/admin-orders.bn.json';
import oen from '../../../messages/admin-orders.en.json';
import bn from '../../../messages/admin-calls.bn.json';
import en from '../../../messages/admin-calls.en.json';
import { adminDicts } from '../admin-i18n';
import { outcomesFrom, outcomesValue } from './calls-api';
import { callLines, noteLine, reasonLabel, type CallsFormat } from './calls-view';

const OUTCOMES = CALL_OUTCOMES_DEFAULT;
const dict = (lang: 'en' | 'bn'): Dict => ({ ...adminDicts[lang], ...((lang === 'bn' ? bn : en) as unknown as Dict) });
const fmt = (lang: 'en' | 'bn'): CallsFormat => ({ w: (k, vars) => t(dict(lang), `cl.${k}`, vars), age: () => '3h', when: (at) => at.toISOString().slice(0, 16), lang });

function row(over: Partial<od.CallRow> = {}): od.CallRow {
  return {
    taskId: '00000000-0000-7000-8000-00000000c001',
    reason: 'NEW_CUSTOMER',
    status: 'OPEN',
    createdAt: new Date('2026-10-31T06:00:00Z'),
    dueAt: null,
    closedAt: null,
    outcome: null,
    notes: null,
    order: { id: 'o1', number: 'EX-1001', status: 'PLACED', customerName: 'Rahim', phone: '01700000000', shippingAddressText: 'Mirpur 10', backfilledAddress: null, addressUnclear: false, chargeFixed: true, flags: ['NEW_CUSTOMER'], placedAt: new Date('2026-10-31T06:00:00Z') },
    ...over,
  };
}

describe('PR 545 · the call queue screen', () => {
  it('a waiting call: its reason, who to phone, how long, and the dialog with the owner outcomes', () => {
    const [l] = callLines(dict('en'), [row()], OUTCOMES, fmt('en'), true);
    expect(l).toMatchObject({ reasonLabel: oen.orders.call.reason.NEW_CUSTOMER, href: '/admin/orders/o1', number: 'EX-1001', name: 'Rahim', phone: '01700000000', state: 'Waiting 3h', tone: 'warn', notes: [] });
    expect(l!.record).toMatchObject({ url: '/api/admin/orders/calls/00000000-0000-7000-8000-00000000c001', version: null, label: oen.orders.call.record.label, sub: 'EX-1001 · Rahim · 01700000000' });
    expect(l!.record!.fields[0]!.options!.map((o) => o.value)).toEqual(OUTCOMES.map((o) => o.key));
    expect(l!.record!.effects[0]).toContain('Spoke — all fine');
    expect(l!.record!.effects[0]).not.toContain('No answer');
  });

  it('tried, made, a reader, no order, an unknown reason; Bengali', () => {
    const tried = callLines(dict('en'), [row({ status: 'IN_PROGRESS', outcome: 'NO_ANSWER', notes: 'Two sizes of the same piece\nNO_ANSWER: switched off' })], OUTCOMES, fmt('en'), true)[0]!;
    expect(tried).toMatchObject({ state: 'Tried · No answer', tone: 'mute', notes: ['Two sizes of the same piece', 'No answer: switched off'] });
    expect(tried.record).not.toBeNull();
    const made = callLines(dict('en'), [row({ status: 'DONE', outcome: 'SPOKE_OK', closedAt: new Date('2026-10-31T08:00:00Z') })], OUTCOMES, fmt('en'), true)[0]!;
    expect(made).toMatchObject({ state: 'Spoke — all fine · 2026-10-31T08:00', tone: 'ok', record: null });
    expect(callLines(dict('en'), [row()], OUTCOMES, fmt('en'), false)[0]!.record).toBeNull();
    const none = callLines(dict('en'), [row({ order: null, reason: 'SOMETHING_NEW' })], OUTCOMES, fmt('en'), true)[0]!;
    expect(none).toMatchObject({ href: null, name: en.cl.noOrder, reasonLabel: 'SOMETHING_NEW' });
    expect(none.record!.sub).toBe('SOMETHING_NEW');
    const b = callLines(dict('bn'), [row({ status: 'IN_PROGRESS', outcome: 'NO_ANSWER' })], OUTCOMES, fmt('bn'), true)[0]!;
    expect(b.reasonLabel).toBe(obn.orders.call.reason.NEW_CUSTOMER);
    expect(b.state).toBe('চেষ্টা হয়েছে · ফোন ধরেনি');
    expect(noteLine(OUTCOMES, 'GONE_KEY: hello', 'en')).toBe('GONE_KEY: hello');
    expect(reasonLabel(dict('en'), 'TWO_SIZE')).toBe(oen.orders.call.reason.TWO_SIZE);
  });

  it('the outcomes card: the list as ticks and words, and back in the same order', () => {
    const v = outcomesValue(OUTCOMES);
    expect(v.done).toEqual({ SPOKE_OK: true, NO_ANSWER: false, CALL_LATER: false, WRONG_NUMBER: true, NOT_ORDERED: true });
    expect(v.SPOKE_OK).toEqual({ en: 'Spoke — all fine', bn: 'কথা হয়েছে — সব ঠিক' });
    expect(outcomesFrom(OUTCOMES, v)).toEqual(OUTCOMES);
    const renamed = outcomesFrom(OUTCOMES, { ...v, NO_ANSWER: { en: 'Did not pick up', bn: 'ধরেনি' }, done: { ...v.done, CALL_LATER: true } }) as typeof OUTCOMES;
    expect(renamed[1]).toEqual({ key: 'NO_ANSWER', en: 'Did not pick up', bn: 'ধরেনি', done: false });
    expect(renamed[2]!.done).toBe(true);
    expect(outcomesFrom(OUTCOMES, { NO_ANSWER: { en: 'x', bn: 'y' } })).toBeNull();
  });

  it('every word exists in English and Bengali; every reason the shop gives has its words', () => {
    const keys = (o: unknown, p = ''): string[] => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p]);
    expect(keys(bn).sort()).toEqual(keys(en).sort());
    expect(keys(obn.orders.call).sort()).toEqual(keys(oen.orders.call).sort());
    for (const r of CALL_TASK_REASONS) expect(reasonLabel(dict('en'), r), r).not.toBe(r);
  });
});
