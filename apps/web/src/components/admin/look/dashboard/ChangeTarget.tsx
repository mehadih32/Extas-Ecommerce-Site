'use client';
// PR 862 (prototype v5 Home, "Change target"): the button on the month target card. It opens a small window with one
// amount box and saves through the same page-settings API the Lumen "Month target" card uses (`PUT /api/admin/dashboard/today`,
// key `goal`, `settings.write`). The target is only a figure to look at: it moves no money and changes no price or order.
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';

export interface ChangeTargetWords {
  button: string;
  title: string;
  field: string;
  save: string;
  cancel: string;
  saved: string;
  failed: string;
}

export function ChangeTarget({ amount, currency, words }: { amount: number; currency: string; words: ChangeTargetWords }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [value, setValue] = useState(String(amount));
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const n = Number(value);
  const valid = value.trim() !== '' && Number.isInteger(n) && n >= 0;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setBad(false);
    try {
      const res = await fetch('/api/admin/dashboard/today', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'goal', on: n > 0, values: { amount: n } }) });
      if (!res.ok) throw new Error(String(res.status));
      dlg.current?.close();
      showToast({ text: words.saved, tone: 'ok' });
      router.refresh();
    } catch {
      setBad(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="a3-tgt-btn" data-testid="dash-target-change" onClick={() => {
          setValue(String(amount));
          dlg.current?.showModal();
        }}>
        {words.button}
      </button>
      <dialog ref={dlg} className="a3-tgt-dlg" aria-labelledby={`${uid}t`} data-testid="dash-target-dialog" onClose={() => setBad(false)}>
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3 id={`${uid}t`}>{words.title}</h3>
          <label htmlFor={`${uid}a`}>{words.field}</label>
          <div className="a3-tgt-in">
            <input id={`${uid}a`} type="number" inputMode="numeric" min={0} step={1} value={value} onChange={(e) => setValue(e.target.value)} data-testid="dash-target-input" />
            <span aria-hidden="true">{currency}</span>
          </div>
          {bad ? (
            <p className="a3-tgt-err" role="alert">
              {words.failed}
            </p>
          ) : null}
          <div className="a3-tgt-foot">
            <button type="button" className="a2-btn" onClick={() => dlg.current?.close()}>
              {words.cancel}
            </button>
            <button type="submit" className="a2-btn pri" disabled={!valid || busy} data-testid="dash-target-save">
              {words.save}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
