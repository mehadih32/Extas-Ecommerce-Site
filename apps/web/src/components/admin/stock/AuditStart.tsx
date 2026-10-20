'use client';
// PR 203 — "start a stock count": pick a location of the shared pool and open its count page. The server refuses a
// second open count of the same location (AUDIT_OPEN) and anyone without `inventory.audit` for every store.
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { Icon } from '../Icon';
import { useToast } from '../products/useToast';
import { countHref, stockRefusal } from './text';

export interface LocationChoice {
  id: string;
  label: string;
}

export function AuditStart({ dict: d, locations }: { dict: Dict; locations: LocationChoice[] }) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [toast, say] = useToast();

  const go = async (e: FormEvent) => {
    e.preventDefault();
    if (!locationId) return;
    setBusy(true);
    try {
      const a = await call('POST', '/api/admin/inventory/audits', { locationId });
      if (a.status !== 201) return say(stockRefusal(d, a.data.error, a.data.details));
      router.push(countHref((a.data.audit as { id: string }).id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="st-start" onSubmit={go}>
      <label className="ad-label" htmlFor="st-loc">
        {t(d, 'stock.counts.location')}
      </label>
      <div className="st-start-row">
        <select id="st-loc" className="ad-input" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={!locations.length}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <button type="submit" className="ad-btn ad-btn-primary ad-btn-sm" disabled={busy || !locationId}>
          <Icon name="barcode" size={16} />
          {t(d, 'stock.counts.start')}
        </button>
      </div>
      {toast ? (
        <div className="ad-toast" role="status">
          {toast}
        </div>
      ) : null}
    </form>
  );
}
