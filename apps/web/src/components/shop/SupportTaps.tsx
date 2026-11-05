'use client';
// S22 · PR 624 (CN-034) — counts taps on the shop's support buttons. Drawn by the store layout only while the Messenger
// button and its counting are on (`support.messengerButton`). One listener for the whole page: a tap on a Messenger
// (m.me), WhatsApp (wa.me) or call (tel:) link sends its channel and place (header, phone menu, WhatsApp disc, or the
// kind of page) to /api/shop/support-tap. Nothing about the visitor is sent; the link opens as before, never held up.
import { useEffect } from 'react';
import { beacon } from '@/lib/shop/beacon';
import { SUPPORT_TAP_URL, tapChannelOf, tapPlaceOf } from '@/lib/shop/support-taps-model';

export function SupportTaps({ productPrefix }: { productPrefix: string }) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!(a instanceof HTMLAnchorElement)) return;
      const ch = tapChannelOf(a.getAttribute('href'));
      if (!ch) return;
      const place = tapPlaceOf({ inFab: !!a.closest('#wa-fab'), inMenu: !!a.closest('.mn-foot'), inHeader: !!a.closest('header.hdr'), path: location.pathname, productPrefix });
      beacon(SUPPORT_TAP_URL, { method: 'POST', body: JSON.stringify({ ch, place }), credentials: 'same-origin', headers: { 'content-type': 'text/plain' } });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [productPrefix]);
  return null;
}
