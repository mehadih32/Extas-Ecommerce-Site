// Follow-up 435 (B1.3) — the orders list's Documents column and the line under the table, in both admin languages:
// one chip per document the order has, a sticker printed again and a handed-over sheet said so, nothing for none.
import { describe, expect, it } from 'vitest';
import type { AdminView } from '../admin-page';
import { adminDicts } from '../admin-i18n';
import { docChips, docsSummaryLine } from './docs';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const NONE = { sticker: 0, invoice: null, picking: 0, handover: 'none' as const };

describe('follow-up 435 · the Documents column', () => {
  it('one chip per document; a sticker printed again, a revised invoice and a handed sheet say so', () => {
    const v = view('en');
    expect(docChips(v, NONE)).toEqual([]);
    expect(docChips(v, { sticker: 1, invoice: 1, picking: 1, handover: 'printed' }).map((c) => c.label)).toEqual(['Sticker', 'Invoice', 'Picking list', 'On a handover sheet']);
    const again = docChips(v, { sticker: 3, invoice: 2, picking: 2, handover: 'handed' });
    expect(again.map((c) => c.label)).toEqual(['Sticker ×3', 'Invoice (revised 2)', 'Picking list ×2', 'Handed over']);
    expect(again.map((c) => c.tone)).toEqual(['warn', 'line', 'line', 'ok']);
    expect(again.every((c) => c.title === 'Documents')).toBe(true);
  });

  it('the line under the table counts each document over the page; nothing when no order has one', () => {
    const v = view('en');
    expect(docsSummaryLine(v, [NONE, NONE])).toBeNull();
    expect(docsSummaryLine(v, [NONE, { ...NONE, sticker: 2, handover: 'handed' }, { ...NONE, sticker: 1, picking: 1, handover: 'printed' }])).toBe(
      'Documents on this page: 2 with a sticker · 1 printed again · 1 on a picking list · 1 on a handover sheet · 1 handed over',
    );
  });

  it('every word in Bengali too, never the key', () => {
    const v = view('bn');
    const all = docChips(v, { sticker: 2, invoice: 2, picking: 2, handover: 'handed' }).map((c) => c.label).concat(docChips(v, { sticker: 1, invoice: 1, picking: 1, handover: 'printed' }).map((c) => c.label));
    for (const w of all) expect(w).not.toMatch(/orders\.list|[A-Za-z]{4,}/);
    expect(docsSummaryLine(v, [{ sticker: 2, invoice: 1, picking: 1, handover: 'printed' }])).not.toMatch(/orders\.list/);
  });
});
