import { describe, expect, it } from 'vitest';
import type { ExchangeView } from '@extas/orders';
import { boardOf, DONE_ON_BOARD, reasonTone, returnsHref, statusTone } from './model';

const ex = (id: string, status: string): ExchangeView => ({ id, status }) as ExchangeView;

describe('the returns board', () => {
  it('puts each exchange in its column, newest first, and keeps only the newest finished ones', () => {
    const rows = [ex('a', 'REQUESTED'), ex('b', 'APPROVED'), ex('c', 'PICKUP_BOOKED'), ex('d', 'RECEIVED'), ex('e', 'QC_FAILED'), ex('f', 'REJECTED'), ...Array.from({ length: DONE_ON_BOARD + 3 }, (_, i) => ex(`done${i}`, 'COMPLETED'))];
    const b = boardOf(rows);
    expect(b.requested.map((r) => r.id)).toEqual(['a']);
    expect(b.approved.map((r) => r.id)).toEqual(['b', 'c']);
    expect(b.qc.map((r) => r.id)).toEqual(['d', 'e']);
    expect(b.done).toHaveLength(DONE_ON_BOARD);
    expect(b.done[0]!.id).toBe('f');
  });

  it('gives the pills their tones and builds the page address', () => {
    expect(reasonTone('size')).toBe('info');
    expect(reasonTone('wrong')).toBe('bad');
    expect(statusTone('REQUESTED')).toBe('warn');
    expect(statusTone('COMPLETED')).toBe('ok');
    expect(returnsHref()).toBe('/admin/orders/returns');
    expect(returnsHref({ case: 'x', order: '', line: null })).toBe('/admin/orders/returns?case=x');
  });
});
