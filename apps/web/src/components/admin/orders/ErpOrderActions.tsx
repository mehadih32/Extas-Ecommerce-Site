'use client';
// PR 610 (CN-028, ERP contract v6) — the form of the ERP part of an order's page, in the browser: a short line's
// decision (WAIT for stock, REPLACE with another SKU, CANCEL with a short reason). It sends
// through the admin API with an idempotency key (lib/admin-orders/commands.ts `send`); the page is then read again.
// Neither moves money: the ERP bills by its contract; the shop's own money is the payments service's.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { newKey, send } from '@/lib/admin-orders/commands';
import type { DecideTexts } from '@/lib/admin-orders/erp';

type Action = 'WAIT' | 'REPLACE' | 'CANCEL';

export function ErpLineDecision({ url, texts, lineId }: { url: string; texts: DecideTexts; lineId: string }) {
  const router = useRouter();
  const id = useId();
  const [action, setAction] = useState<Action>('WAIT');
  const [sku, setSku] = useState('');
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const ready = action === 'WAIT' || (action === 'REPLACE' && sku.trim()) || (action === 'CANCEL' && reason.trim());
  const go = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const body = action === 'REPLACE' ? { action, sku: sku.trim() } : action === 'CANCEL' ? { action, reason: reason.trim() } : { action };
    const a = await send(url, body, key);
    setBusy(false);
    setKey(newKey());
    if (a.ok) {
      setSaid({ text: texts.done, bad: false });
      router.refresh();
    } else setSaid({ text: texts.errors[a.code] ?? texts.errors.other ?? a.code, bad: true });
  };
  return (
    <fieldset className="a2-mt12" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} data-testid={`erp-decide-${lineId}`}>
      <legend className="a2-xs a2-b">{texts.title}</legend>
      <div className="a2-gap8" style={{ flexWrap: 'wrap' }}>
        {(['WAIT', 'REPLACE', 'CANCEL'] as const).map((x) => (
          <label key={x} className="a2-chkl">
            <input type="radio" className="a2-chk" name={`${id}-action`} value={x} checked={action === x} onChange={() => setAction(x)} />
            <span>{texts[x]}</span>
          </label>
        ))}
      </div>
      {action === 'REPLACE' ? (
        <div className="a2-mt12">
          <label className="a2-lbl" htmlFor={`${id}-sku`}>
            {texts.sku}
          </label>
          <input id={`${id}-sku`} className="a2-inp" value={sku} maxLength={64} onChange={(e) => setSku(e.target.value)} autoComplete="off" />
          <span className="a2-xs a2-mute a2-blk">{texts.skuHint}</span>
        </div>
      ) : null}
      {action === 'CANCEL' ? (
        <div className="a2-mt12">
          <label className="a2-lbl" htmlFor={`${id}-reason`}>
            {texts.reason}
          </label>
          <input id={`${id}-reason`} className="a2-inp" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </div>
      ) : null}
      <div className="a2-mt12">
        <button type="button" className="a2-btn sm" onClick={go} disabled={!ready || busy} data-testid={`erp-decide-send-${lineId}`}>
          {texts.send}
        </button>
      </div>
      {said ? (
        <div className={`a2-note${said.bad ? ' bad' : ''}`} role={said.bad ? 'alert' : 'status'}>
          {said.text}
        </div>
      ) : null}
    </fieldset>
  );
}
