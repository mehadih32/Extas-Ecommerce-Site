'use client';
// PR 610, 611 (CN-028, ERP contract v6) — the two forms of the ERP part of an order's page, in the browser: a short
// line's decision (WAIT for stock, REPLACE with another SKU, CANCEL with a short reason) and the Partial delivery box
// (the lines the customer kept, the amount paid, any discount promised by phone, confirmed by phone, a note). Each sends
// through the admin API with an idempotency key (lib/admin-orders/commands.ts `send`); the page is then read again.
// Neither moves money: the ERP bills by its contract; the shop's own money is the payments service's.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { newKey, send } from '@/lib/admin-orders/commands';
import type { BoxTexts, DecideTexts, ErpBoxView } from '@/lib/admin-orders/erp';

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

export function ErpPartialBox({ box, texts, orderId }: { box: ErpBoxView; texts: BoxTexts; orderId: string }) {
  const router = useRouter();
  const id = useId();
  const [kept, setKept] = useState<Set<string>>(() => new Set(box.start.kept));
  const [paid, setPaid] = useState(String(box.start.paid));
  const [discount, setDiscount] = useState(String(box.start.discount));
  const [phone, setPhone] = useState(box.start.phone);
  const [note, setNote] = useState(box.start.note);
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const whole = (v: string) => (/^\d{1,9}$/.test(v.trim()) ? Number(v.trim()) : null);
  const ready = box.open && whole(paid) !== null && whole(discount) !== null;
  const unit = 10 ** box.digits;
  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const a = await send(box.url, { orderId, keptLineIds: [...kept], paidMinor: whole(paid)! * unit, discountGivenMinor: whole(discount)! * unit, phoneConfirmed: phone, note: note.trim() || null }, key);
    setBusy(false);
    setKey(newKey());
    if (a.ok) {
      setSaid({ text: texts.saved, bad: false });
      router.refresh();
    } else setSaid({ text: texts.errors[a.code] ?? texts.errors.other ?? a.code, bad: true });
  };
  const toggle = (lineId: string) =>
    setKept((s) => {
      const n = new Set(s);
      if (n.has(lineId)) n.delete(lineId);
      else n.add(lineId);
      return n;
    });
  return (
    <div data-testid="erp-partial-box">
      <div className="a2-lines">
        {box.lines.map((l) => (
          <label key={l.lineId} className="a2-prow a2-chkl">
            <input type="checkbox" className="a2-chk" checked={kept.has(l.lineId)} disabled={!box.open} onChange={() => toggle(l.lineId)} data-testid={`erp-kept-${l.lineId}`} />
            <span className="a2-prt">
              <b className="a2-mono">{l.sku}</b>
              <span className="a2-xs a2-mute">
                {l.lineId}
                {l.fromReturn ? ` · ${texts.fromReturn}` : ''}
              </span>
            </span>
            <span className="a2-prs">{l.price}</span>
          </label>
        ))}
      </div>
      <div className="a2-mt12">
        <label className="a2-lbl" htmlFor={`${id}-paid`}>
          {texts.paid}
        </label>
        <input id={`${id}-paid`} className="a2-inp" inputMode="numeric" value={paid} disabled={!box.open} onChange={(e) => setPaid(e.target.value)} data-testid="erp-box-paid" />
        <label className="a2-lbl a2-mt12" htmlFor={`${id}-disc`}>
          {texts.discount}
        </label>
        <input id={`${id}-disc`} className="a2-inp" inputMode="numeric" value={discount} disabled={!box.open} onChange={(e) => setDiscount(e.target.value)} data-testid="erp-box-discount" />
        <span className="a2-xs a2-mute a2-blk">{texts.discountHint}</span>
        <label className="a2-chkl a2-mt12">
          <input type="checkbox" className="a2-chk" checked={phone} disabled={!box.open} onChange={(e) => setPhone(e.target.checked)} />
          <span>{texts.phone}</span>
        </label>
        <label className="a2-lbl a2-mt12" htmlFor={`${id}-note`}>
          {texts.note}
        </label>
        <input id={`${id}-note`} className="a2-inp" value={note} maxLength={500} disabled={!box.open} onChange={(e) => setNote(e.target.value)} />
      </div>
      {box.open ? (
        <div className="a2-mt12">
          <button type="button" className="a2-btn sm" onClick={save} disabled={!ready || busy} data-testid="erp-box-save">
            {texts.save}
          </button>
        </div>
      ) : null}
      {said ? (
        <div className={`a2-note${said.bad ? ' bad' : ''}`} role={said.bad ? 'alert' : 'status'}>
          {said.text}
        </div>
      ) : null}
    </div>
  );
}
