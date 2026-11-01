'use client';
// S22 · PR 429 (Blueprint B4.6) — drawn by the product page only when its address carries a support chat's reference
// (`?r=`, from a product link sent from the chat). Once the page has opened it posts the reference to
// /api/shop/support-ref, which notes the click and keeps the reference for the order's credit (only while products in
// the chat are on, and only for a reference of this store). It reads nothing typed, draws nothing and never holds the
// page up.
import { useEffect, useRef } from 'react';
import { beacon } from '@/lib/shop/beacon';

export const SUPPORT_REF_BEACON_URL = '/api/shop/support-ref';

export function SupportRefBeacon({ code }: { code: string }) {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (sent.current === code) return;
    sent.current = code;
    beacon(SUPPORT_REF_BEACON_URL, { method: 'POST', body: JSON.stringify({ r: code }), credentials: 'same-origin', headers: { 'content-type': 'text/plain' } });
  }, [code]);
  return null;
}
