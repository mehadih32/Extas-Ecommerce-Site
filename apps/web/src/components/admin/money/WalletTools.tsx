'use client';
// Go-live gate F-054 (follow-up of PR 171) — the working buttons of a customer's Wallet tab: a person adds money to the
// wallet or takes it out by hand (with a reason, the [confirm] tick and a request key kept until it is written, so a
// double tap is one line), and puts one ledger line right with a new line the other way. Both call the payments API
// (lib/payments-api.ts), which checks `payments.wallet`, the owner's switch and largest line (`payments.wallet.manual`)
// and writes the audit row; the page is read again after. No line is ever changed or removed (CLAUDE.md rule 3).
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { typedMinor } from '@/lib/admin-books/money';
import { errWords, newKey, post, type Words } from './RefundActions';

const fill = (s: string | undefined, vars: Record<string, string> = {}) => (s ?? '').replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);

export interface WalletAdjustProps {
  w: Words;
  customerId: string;
  digits: number;
  currency: string;
  testId: string;
}

/** Add to or take from one customer's wallet by hand (`payments.wallet`; the owner's switch must be on). */
export function WalletAdjust(p: WalletAdjustProps) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [kind, setKind] = useState<'MANUAL' | 'OFFER'>('MANUAL');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [key, setKey] = useState(newKey);
  const typed = typedMinor(amount, p.digits);
  const ready = !busy && sure && typed !== null && typed > 0 && note.trim().length >= 3;
  const reset = () => {
    setAmount('');
    setNote('');
    setSure(false);
    setKind('MANUAL');
    setDirection('CREDIT');
  };
  async function go() {
    if (!ready) return;
    setBusy(true);
    const a = await post(`/api/admin/payments/wallets/${p.customerId}/entries`, { direction, amountMinor: typed, kind: direction === 'CREDIT' ? kind : 'MANUAL', note: note.trim(), confirm: true }, key);
    setBusy(false);
    if (!a.error) {
      setKey(newKey());
      setOpen(false);
      reset();
      setSaid({ text: p.w['wallet.adjust.done'] ?? '', bad: false });
      return router.refresh();
    }
    setSaid({ text: errWords(p.w, a.error), bad: true });
  }
  return (
    <div className="rf-act" data-testid={p.testId}>
      <button type="button" className="a2-btn sm" aria-expanded={open} aria-controls={`${id}-f`} onClick={() => (setOpen(!open), setSaid(null))} data-testid={`${p.testId}-open`}>
        {p.w['wallet.adjust.open']}
      </button>
      {open ? (
        <div className="rf-form a2-mt6" id={`${id}-f`} data-testid={`${p.testId}-form`}>
          <fieldset className="a2-fld rf-pick">
            <legend className="a2-lbl">{p.w['wallet.adjust.direction']}</legend>
            {(['CREDIT', 'DEBIT'] as const).map((x) => (
              <label key={x} className="a2-chkl">
                <input type="radio" name={`${id}-dir`} checked={direction === x} disabled={busy} onChange={() => setDirection(x)} data-testid={`${p.testId}-${x.toLowerCase()}`} />
                <span>{p.w[`wallet.adjust.${x === 'CREDIT' ? 'credit' : 'debit'}`]}</span>
              </label>
            ))}
          </fieldset>
          {direction === 'CREDIT' ? (
            <fieldset className="a2-fld rf-pick">
              <legend className="a2-lbl">{p.w['wallet.adjust.kind']}</legend>
              {(['MANUAL', 'OFFER'] as const).map((x) => (
                <label key={x} className="a2-chkl">
                  <input type="radio" name={`${id}-kind`} checked={kind === x} disabled={busy} onChange={() => setKind(x)} data-testid={`${p.testId}-kind-${x.toLowerCase()}`} />
                  <span>{p.w[`wallet.adjust.${x === 'MANUAL' ? 'manual' : 'offer'}`]}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-amt`}>
              {p.w['wallet.adjust.amount']} ({p.currency})
            </label>
            <input id={`${id}-amt`} className="a2-inp" inputMode="decimal" autoComplete="off" value={amount} disabled={busy} onChange={(e) => (setAmount(e.target.value), setSure(false))} data-testid={`${p.testId}-amount`} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-note`}>
              {p.w['wallet.adjust.note']}
            </label>
            <input id={`${id}-note`} className="a2-inp" maxLength={500} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} data-testid={`${p.testId}-note`} />
          </div>
          <label className="a2-chkl">
            <input type="checkbox" className="a2-chk" checked={sure} disabled={busy || typed === null || typed <= 0} onChange={(e) => setSure(e.target.checked)} data-testid={`${p.testId}-sure`} />
            <span>{fill(p.w['wallet.adjust.sure'], { amount: `${direction === 'CREDIT' ? '+' : '−'}${amount.trim()} ${p.currency}` })}</span>
          </label>
          <div className="a2-gap8 a2-mt6">
            <button type="button" className="a2-btn sm pri" disabled={!ready} onClick={go} data-testid={`${p.testId}-go`}>
              {busy ? p.w.working : p.w['wallet.adjust.go']}
            </button>
            <button type="button" className="a2-btn sm" disabled={busy} onClick={() => (setOpen(false), reset())}>
              {p.w.cancel}
            </button>
          </div>
        </div>
      ) : null}
      {said ? (
        <p className={`a2-xs a2-mt6 ${said.bad ? 'bk-warn' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'} data-testid={`${p.testId}-said`}>
          {said.text}
        </p>
      ) : null}
    </div>
  );
}

export interface WalletReverseProps {
  w: Words;
  entryId: string;
  amount: string;
  testId: string;
}

/** Put one ledger line right with a new line the other way, once (`payments.wallet`). */
export function WalletReverse(p: WalletReverseProps) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const ready = !busy && sure && note.trim().length >= 3;
  async function go() {
    if (!ready) return;
    setBusy(true);
    const a = await post(`/api/admin/payments/wallets/entries/${p.entryId}/reverse`, { note: note.trim(), confirm: true });
    setBusy(false);
    if (!a.error) {
      setOpen(false);
      setSaid({ text: p.w['wallet.reverse.done'] ?? '', bad: false });
      return router.refresh();
    }
    setSaid({ text: errWords(p.w, a.error), bad: true });
  }
  return (
    <div className="rf-act" data-testid={p.testId}>
      <button type="button" className="a2-btn sm" aria-expanded={open} aria-controls={`${id}-f`} onClick={() => (setOpen(!open), setSaid(null), setSure(false), setNote(''))} data-testid={`${p.testId}-open`}>
        {p.w['wallet.reverse.btn']}
      </button>
      {open ? (
        <div className="rf-form a2-mt6" id={`${id}-f`}>
          <p className="a2-xs">{fill(p.w['wallet.reverse.what'], { amount: p.amount })}</p>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-note`}>
              {p.w['f.reason']}
            </label>
            <input id={`${id}-note`} className="a2-inp" maxLength={500} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} data-testid={`${p.testId}-note`} />
          </div>
          <label className="a2-chkl">
            <input type="checkbox" className="a2-chk" checked={sure} disabled={busy} onChange={(e) => setSure(e.target.checked)} data-testid={`${p.testId}-sure`} />
            <span>{fill(p.w['wallet.reverse.sure'], { amount: p.amount })}</span>
          </label>
          <div className="a2-gap8 a2-mt6">
            <button type="button" className="a2-btn sm badf" disabled={!ready} onClick={go} data-testid={`${p.testId}-go`}>
              {busy ? p.w.working : p.w['wallet.reverse.go']}
            </button>
            <button type="button" className="a2-btn sm" disabled={busy} onClick={() => setOpen(false)}>
              {p.w.cancel}
            </button>
          </div>
        </div>
      ) : null}
      {said ? (
        <p className={`a2-xs a2-mt6 ${said.bad ? 'bk-warn' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'} data-testid={`${p.testId}-said`}>
          {said.text}
        </p>
      ) : null}
    </div>
  );
}
