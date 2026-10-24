// PR 184 — the tracking steps once the courier moves the order: a step passed without its own time (the courier picked
// the parcel up before anyone pressed "Packed") is ticked and says nothing, never "coming up"; the next step still says
// it is next. Every value is a made-up test value.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/shop-account.en.json';
import { t, type Dict } from '@/lib/i18n';
import type { ShopContext } from '@/lib/shop/context';
import { OrderTrack } from './OrderTrack';

const c = { lang: 'en', bnDigits: false, s: { 'store.timeZone': 'Asia/Dhaka' }, t: (k: string, v?: Record<string, string | number>) => t(en as Dict, k, v), num: (n: number) => String(n) } as unknown as ShopContext;

describe('the tracking steps (PR 184)', () => {
  it('a step passed without its own time shows no "coming up"', () => {
    const at = { placed: '2026-10-20T04:00:00Z', confirmed: '2026-10-20T05:00:00Z', courier: '2026-10-21T05:00:00Z' }; // hardcode-ok: made-up test times
    const html = renderToStaticMarkup(<OrderTrack c={c} track={{ reached: 3, ended: null, at, done: false }} late={{ late: false, dueBy: null }} hours={null} lateWa={null} />);
    const packed = html.slice(html.indexOf('data-step="packed"'), html.indexOf('data-step="courier"'));
    expect(packed).not.toContain(t(en as Dict, 'account.track.soon'));
    const delivered = html.slice(html.indexOf('data-step="delivered"'));
    expect(delivered).toContain(t(en as Dict, 'account.track.next'));
  });
});
