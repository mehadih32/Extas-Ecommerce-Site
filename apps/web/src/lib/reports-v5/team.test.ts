// PR 798 — Team report sums: what each person did, the time to confirm, the first reply and the chat-to-order share.
import { describe, expect, it } from 'vitest';
import { actsOf, avg, chatConversion, total, type EventRow, type ReplyRow } from './team';

const H = 3_600_000;
const T = Date.UTC(2026, 10, 10, 6);
const e = (staffId: string, toStatus: string | null, over: Partial<EventRow> = {}): EventRow => ({ staffId, type: 'order.status', toStatus, at: T + 2 * H, orderId: 'o1', orderNumber: 'EX-1', placedAt: T, ...over });

describe('Team report sums (PR 798)', () => {
  it('counts each kind of work per person and times the confirm from the order being placed', () => {
    const replies: ReplyRow[] = [{ staffId: 'a', conversationId: 'c1', at: T, afterMin: 12, contact: 'Rina' }, { staffId: 'a', conversationId: 'c1', at: T + 1, afterMin: null, contact: 'Rina' }];
    const m = actsOf([e('a', 'CONFIRMED'), e('a', 'CONFIRMED', { at: T + 4 * H, orderId: 'o2' }), e('a', 'PACKED'), e('b', 'HANDED_OVER'), e('b', null, { type: 'order.exchange' }), e('b', 'CANCELLED')], replies);
    expect(m.get('a')).toMatchObject({ confirm: 2, pack: 1, msgs: 2, rt: [12] });
    expect(avg(m.get('a')!.ct)).toBe(3);
    expect(m.get('b')).toMatchObject({ hand: 1, exch: 1, cancel: 1 });
    expect(total(m.get('a')!)).toBe(5);
    expect(m.get('a')!.log.filter((x) => x.kind === 'replied')).toHaveLength(2);
  });
  it('counts a chat as turned into an order only inside 48 hours of the first reply', () => {
    const convs = [{ customerId: 'x', by: 'a', firstReplyAt: T }, { customerId: 'y', by: 'a', firstReplyAt: T }, { customerId: null, by: 'b', firstReplyAt: T }];
    const orders = [{ customerId: 'x', at: T + 47 * H }, { customerId: 'y', at: T + 49 * H }, { customerId: 'x', at: T - H }];
    const r = chatConversion(convs, orders);
    expect(r.get('a')).toEqual({ chats: 2, orders: 1 });
    expect(r.get('b')).toEqual({ chats: 1, orders: 0 });
  });
  it('says 0 for an empty list', () => {
    expect(avg([])).toBe(0);
  });
});
