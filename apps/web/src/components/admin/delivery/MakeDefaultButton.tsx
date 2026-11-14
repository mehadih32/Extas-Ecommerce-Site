'use client';
// Couriers › All couriers — "Make default": one tap saves the default courier through the same card as Delivery settings
// (PUT /api/admin/delivery/settings, `delivery.charges`, with the version the page showed, so a stale tap is refused).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

export function MakeDefaultButton({ courierId, version, value, label, done, failed }: { courierId: string; version: string; value: Record<string, unknown>; label: string; done: string; failed: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const a = await call('PUT', '/api/admin/delivery/settings', { key: 'delivery.couriers', version, value: { ...value, defaultCourierId: courierId } });
    setBusy(false);
    if (a.status === 200 && a.data.ok) {
      showToast({ text: done, tone: 'ok' });
      router.refresh();
    } else showToast({ text: failed, tone: 'bad' });
  };
  return (
    <button type="button" className="a2-btn sm" onClick={go} disabled={busy} data-testid="courier-make-default">
      {label}
    </button>
  );
}
