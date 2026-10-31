// S06 · PR 162 — the Blocklist card's data: every word in both admin languages, the rows shown the local way (the phone,
// who and when, the order it came from, an undo's who and why), a hold refused before it is sent without a reason on
// the owner's list, the timeline line of a marked order, the red chip on the order lists, and the order screen's "Add
// number to blocklist" only with `risk.block` (it sends the order's id and the reason, never a cancel).
import { describe, expect, it } from 'vitest';
import type { BlocklistView } from '@extas/orders';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import { blocklistCardScreen, blocklistCardTexts, blocklistDraftProblem, blocklistSummary, sameBlocklist } from './blocklist-card';
import { commandSpecs } from './detail';
import { flagChips } from './list';
import { bodyOf } from './spec';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const ORDER = '0b9f3c1e-5a4d-4c2b-9e8f-1a2b3c4d5e6f';
const VIEW: BlocklistView = {
  value: { enabled: false, onOrder: 'mark', holdReasonKey: 'risk-check' },
  active: [{ id: 'a1', phone: '+8801700000501', reason: 'refused three parcels', orderId: ORDER, orderNumber: 'EX-1001', identity: true, blockedAt: '2026-10-31T04:00:00.000Z', blockedBy: 'Sample staff', undoneAt: null, undoneBy: null, undoReason: null }],
  undone: [{ id: 'u1', phone: '+8801700000502', reason: 'a fake order', orderId: null, orderNumber: null, identity: false, blockedAt: '2026-10-30T04:00:00.000Z', blockedBy: null, undoneAt: '2026-10-31T05:00:00.000Z', undoneBy: 'Sample owner', undoReason: 'paid in advance now' }],
  holdReasons: [{ key: 'risk-check', en: 'Risk check', bn: 'ঝুঁকি যাচাই' }],
  reasonLimits: { min: 5, max: 500 },
};

describe('PR 162 · the Blocklist card', () => {
  it('every word in both languages', () => {
    for (const lang of ['en', 'bn'] as const) {
      const x = blocklistCardTexts(view(lang));
      for (const [k, v] of Object.entries(x)) {
        if (typeof v === 'string') expect(v, `${lang} ${k}`).not.toMatch(/^orders\./);
        else for (const [k2, v2] of Object.entries(v)) expect(v2, `${lang} ${k}.${k2}`).not.toMatch(/^orders\./);
      }
      for (const k of ['order_blocklistMatch', 'blocklistWhy', 'blocklistIdentity', 'blocklistHeld', 'blocklistNotHeld']) expect(t(adminDicts[lang], `orders.ev.${k}`), `${lang} ev.${k}`).not.toBe(`orders.ev.${k}`);
    }
  });

  it('rows the local way: the phone, who and when in the shop time, the order it came from, an undo with who and why', () => {
    const s = blocklistCardScreen(view('bn'), VIEW);
    expect(s.active[0]).toMatchObject({ phone: expect.stringMatching(/^01700/), who: 'Sample staff', order: { number: 'EX-1001', href: `/admin/orders/${ORDER}` }, identity: true, undoneWho: null });
    expect(s.active[0]!.when).toMatch(/10:00/);
    expect(s.undone[0]).toMatchObject({ who: t(adminDicts.bn, 'orders.who.staff'), undoneWho: 'Sample owner', undoReason: 'paid in advance now', order: null });
    expect(s.reasons).toEqual([{ key: 'risk-check', name: 'ঝুঁকি যাচাই' }]);
    expect(s.reasonLimits).toEqual({ min: 5, max: 500 });
  });

  it('a hold needs a reason on the owner list; a mark does not', () => {
    const s = blocklistCardScreen(view('en'), VIEW);
    expect(blocklistDraftProblem({ ...s.value, onOrder: 'hold' }, s.reasons)).toBeNull();
    expect(blocklistDraftProblem({ ...s.value, onOrder: 'hold', holdReasonKey: 'gone' }, s.reasons)).toBe('noReason');
    expect(blocklistDraftProblem({ ...s.value, holdReasonKey: 'gone' }, s.reasons)).toBeNull();
    expect(sameBlocklist(s.value, { ...s.value })).toBe(true);
    expect(sameBlocklist(s.value, { ...s.value, enabled: true })).toBe(false);
  });

  it('the timeline line says why it was listed, the same person and the hold', () => {
    expect(blocklistSummary(view('en'), { via: 'identity', reason: 'refused three parcels', hold: 'held' })).toBe('listed because: refused three parcels · the same person under another number · held for a person to decide');
    expect(blocklistSummary(view('en'), { via: 'phone', reason: 'refused three parcels', hold: 'NO_REASON' })).toContain('marked only');
    expect(blocklistSummary(view('en'), null)).toBeNull();
  });

  it('a red "Blocklist" chip on the order lists', () => {
    const chips = flagChips(view('en'), { cancelRequested: false, inReview: false, status: 'PLACED', holdReasonCode: null, customerWantsChange: false, flags: ['RISK_BLOCKLIST'], orderGroupId: null, internalFlags: [], source: 'WEBSITE' } as unknown as Parameters<typeof flagChips>[1], { holdReasons: new Map(), flags: new Map() });
    expect(chips).toContainEqual({ label: 'Blocklist', tone: 'bad' });
  });

  it('the order screen offers "Add number to blocklist" only with risk.block and a phone; it sends the order and the reason', () => {
    const o = { id: ORDER, number: 'EX-1001', version: 3, status: 'PLACED' as const, holdFromStatus: null, cancelRequested: false, cancelPending: false, booked: false, internalFlags: [], paidMinor: 0, currency: 'BDT', phone: '+8801700000501' };
    const reasons = { hold: [], cancel: [], flags: [], edit: [], refusal: [] } as unknown as Parameters<typeof commandSpecs>[4];
    const find = (perms: string[], over = {}) => commandSpecs(view('en'), { ...o, ...over }, [], new Set(perms), reasons).more.find((s) => s.id === 'blockNumber');
    expect(find(['orders.read'])).toBeUndefined();
    expect(find(['orders.read', 'risk.block'], { phone: null })).toBeUndefined();
    const spec = find(['orders.read', 'risk.block'])!;
    expect(spec).toMatchObject({ url: '/api/admin/risk/blocklist', version: null, title: 'Add the number of EX-1001 to the blocklist' });
    expect(spec.effects.join(' ')).toContain('not changed or cancelled');
    expect(bodyOf(spec, { reason: '  refused three parcels ' })).toEqual({ orderId: ORDER, reason: 'refused three parcels' });
  });
});
