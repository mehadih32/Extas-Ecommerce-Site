'use client';
// S06 · PR 559 — the phone-entry risk check's page side (only while the owner's `checkout.phoneRisk` is on). The moment
// the phone number is whole, the page tells the server once per number (`/api/checkout/phone-risk`) and carries on: the
// server asks the courier fraud checks in the background and keeps their answers for the checkout's own look. Nothing is
// drawn, nothing is waited for, and the answer is read and dropped — a slow or failed check simply passes the customer.
import { useEffect, useRef } from 'react';
import { phoneNormalizeBD } from '@extas/checkout/pure';
import { beacon } from '@/lib/shop/beacon';

export const PHONE_RISK_URL = '/api/checkout/phone-risk';

export function PhoneRiskPing({ phone }: { phone: string }) {
  const asked = useRef(new Set<string>());
  const typed = phoneNormalizeBD(phone);
  const e164 = typed.ok ? typed.e164 : null;
  useEffect(() => {
    if (!e164 || asked.current.has(e164)) return;
    asked.current.add(e164);
    // fire and forget: the form never waits for it, and a failure is nobody's business but the server's; the answer is
    // read and dropped (PR 104's rule: no answer left unread)
    beacon(PHONE_RISK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: e164 }) });
  }, [e164]);
  return null;
}
