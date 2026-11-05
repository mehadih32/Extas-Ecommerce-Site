// PR 533 — the customer history card's words at approval: every tile, outcome and line in both admin languages, the
// tiles with nothing in them left out (orders, delivered and refused always shown), the reasons by the owner's own
// names (the key itself once removed from his list), a first order said in words, Western digits. Made-up values.
import { describe, expect, it } from 'vitest';
import { APPROVAL_OUTCOMES, type ApprovalHistoryView } from '@extas/orders';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import { approvalCard } from './approval';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const ZERO = { orders: 0, delivered: 0, checking: 0, refused: 0, chargePaid: 0, ourFault: 0, returned: 0, exchanges: 0, cancelled: 0, open: 0, noAnswer: 0 };
const at = new Date('2026-10-20T06:00:00Z');
const h: ApprovalHistoryView = {
  phone: '01700-000533',
  counts: { ...ZERO, orders: 12, delivered: 9, refused: 2, chargePaid: 1, exchanges: 1 },
  reasons: [
    { key: 'changed-mind', count: 2 },
    { key: 'gone-key', count: 1 },
  ],
  noReason: 0,
  recent: [{ id: '01a16af2-30f0-7462-aab8-719bb3ce51b1', number: 'EX-1001', placedAt: at, outcome: 'chargePaid', reasonKey: 'changed-mind', exchange: true, returned: false }],
  firstAt: at,
  mark: null,
};

describe('PR 533 · the customer history card', () => {
  it('has every word in both languages', () => {
    for (const lang of ['en', 'bn'] as const) {
      const d = adminDicts[lang];
      for (const k of ['title', 'sub', 'noPhone', 'first', 'reasons', 'noReason', 'recent', 'exchange', 'note', 'verified']) expect(t(d, `orders.appr.${k}`), `${lang} ${k}`).not.toBe(`orders.appr.${k}`);
      for (const k of Object.keys(ZERO)) expect(t(d, `orders.appr.tile.${k}`), `${lang} tile ${k}`).not.toBe(`orders.appr.tile.${k}`);
      for (const k of APPROVAL_OUTCOMES) expect(t(d, `orders.appr.out.${k}`), `${lang} out ${k}`).not.toBe(`orders.appr.out.${k}`);
    }
  });

  it('shows the tiles that have something, the reasons by the owner\'s names and the latest orders', () => {
    const c = approvalCard(view('en'), h, new Map([['changed-mind', 'Changed his mind']]));
    expect(c.tiles!.map((x) => x.key)).toEqual(['orders', 'delivered', 'refused', 'chargePaid', 'exchanges']);
    expect(c.tiles![0]).toMatchObject({ value: '12', label: 'orders' });
    expect(c.sub).toContain('01700-000533');
    expect(c.reasons).toEqual([
      { label: 'Changed his mind', value: '2' },
      { label: 'gone-key', value: '1' },
    ]);
    expect(c.noReason).toBeNull();
    expect(c.recent[0]).toMatchObject({ number: 'EX-1001', href: '/admin/orders/01a16af2-30f0-7462-aab8-719bb3ce51b1', tone: 'bad', outcome: 'Refused, charge paid', extra: 'Changed his mind · exchange' });
    const bn = approvalCard(view('bn'), { ...h, noReason: 3 }, new Map());
    expect(bn.tiles![0]!.value).toBe('12');
    expect(bn.noReason).toContain('3');
  });

  it('a first order, or no phone, is said in words', () => {
    const c = approvalCard(view('en'), { ...h, counts: ZERO, reasons: [], recent: [], firstAt: null }, new Map());
    expect(c.tiles).toBeNull();
    expect(c.first).toBe(t(adminDicts.en, 'orders.appr.first'));
    expect(approvalCard(view('en'), { ...h, phone: null }, new Map()).sub).toBe(t(adminDicts.en, 'orders.appr.noPhone'));
  });

  it('PR 534: the grade in the language read and the verified mark, none while grading is off', () => {
    expect(approvalCard(view('en'), h, new Map())).toMatchObject({ grade: null, verified: null });
    const marked = { ...h, mark: { grade: { key: 'gold', nameEn: 'Gold', nameBn: 'সোনা' }, verified: true } };
    expect(approvalCard(view('en'), marked, new Map())).toMatchObject({ grade: 'Gold', verified: t(adminDicts.en, 'orders.appr.verified') });
    expect(approvalCard(view('bn'), marked, new Map()).grade).toBe('সোনা');
    expect(approvalCard(view('bn'), { ...marked, mark: { grade: { key: 'new', nameEn: 'New', nameBn: null }, verified: false } }, new Map())).toMatchObject({ grade: 'New', verified: null });
  });
});
