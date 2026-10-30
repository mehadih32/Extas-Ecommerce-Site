'use client';
// CN-028 · PR 613 — the one action of the Returns section (/admin/orders/returns/erp): pull from the ERP again and
// compare again. A difference with the ERP is fixed only this way, never by editing a number. After the pull the page
// is read again from the server (lib/returns-erp-api.ts → @extas/orders returns-erp.ts).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '@/components/admin/api';

export function ErpComparePull({ label, date, errors }: { label: string; date: string | null; errors: Record<string, string> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true);
    setErr('');
    const a = await call('POST', '/api/admin/returns/erp/compare', date ? { date } : {});
    setBusy(false);
    if (!a.data.ok) {
      setErr(errors[a.data.error ?? ''] ?? errors['server-error'] ?? '');
      return;
    }
    router.refresh();
  };
  return (
    <div className="a2-stack">
      <button type="button" className="a2-btn pri" disabled={busy} aria-busy={busy} onClick={go} data-testid="erp-returns-pull">
        {label}
      </button>
      {err ? (
        <p className="a2-sm rt-bad" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}
