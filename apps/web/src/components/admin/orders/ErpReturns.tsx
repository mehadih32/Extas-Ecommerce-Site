'use client';
// CN-028 · PR 613 — the one action of the Returns section (/admin/orders/returns/erp): pull from the ERP again and
// compare again. A difference with the ERP is fixed only this way, never by editing a number. After the pull the page
// is read again from the server (lib/returns-erp-api.ts → @extas/orders returns-erp.ts).
// PR 614 — the late-return mark of an exchange (the case card): the old piece came back late with no matching
// consignment; the ERP is told and puts it on Hold for the owner (lib/returns-api.ts → exchange-v6.ts).
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
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

export function ExchangeLateReturn({ url, today, texts }: { url: string; today: string; texts: { open: string; day: string; note: string; save: string; cancel: string; errors: Record<string, string> } }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true);
    setErr('');
    const a = await call('POST', url, { handedBackAt: day, ...(note.trim() ? { note: note.trim() } : {}) });
    setBusy(false);
    if (!a.data.ok) {
      setErr(texts.errors[a.data.error ?? ''] ?? texts.errors['server-error'] ?? '');
      return;
    }
    setOpen(false);
    router.refresh();
  };
  if (!open)
    return (
      <div className="a2-cmds a2-mt6">
        <button type="button" className="a2-btn" onClick={() => setOpen(true)} data-testid="exchange-late-open">
          {texts.open}
        </button>
      </div>
    );
  return (
    <div className="a2-card tight a2-stack a2-mt6" data-testid="exchange-late-form">
      <div>
        <label className="a2-lbl" htmlFor={`${id}-d`}>
          {texts.day}
        </label>
        <input id={`${id}-d`} type="date" className="a2-inp" value={day} max={today} onChange={(e) => setDay(e.target.value)} />
      </div>
      <div>
        <label className="a2-lbl" htmlFor={`${id}-n`}>
          {texts.note}
        </label>
        <input id={`${id}-n`} className="a2-inp" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {err ? (
        <p className="a2-xs rt-bad" role="alert">
          {err}
        </p>
      ) : null}
      <div className="a2-cmds">
        <button type="button" className="a2-btn pri" disabled={busy || !day} onClick={go} data-testid="exchange-late-save">
          {texts.save}
        </button>
        <button type="button" className="a2-btn" onClick={() => setOpen(false)}>
          {texts.cancel}
        </button>
      </div>
    </div>
  );
}
