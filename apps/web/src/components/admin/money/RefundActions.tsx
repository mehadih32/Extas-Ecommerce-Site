'use client';
// Go-live gate F-041 / F-054 (follow-up of PR 172, 171) — the working buttons of Money › Refunds & wallet: one refund's
// next step and the late-delivery apology credit on one order. Each opens a small form under its row with what will
// happen, the note and the [confirm] tick, then calls the payments API (lib/payments-api.ts), which checks the
// permission, the owner's rules and four eyes again and writes the audit row; the page is read again after. A payout and
// the apology are sent with a request key kept until they are written, so a double tap records them once. Money back by
// bKash or the bank is sent by a person first; "Mark paid" only records its reference (CLAUDE.md rule 6).
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { typedMinor } from '@/lib/admin-books/money';

export type Words = Record<string, string>;

const fill = (s: string | undefined, vars: Record<string, string> = {}) => (s ?? '').replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
export const newKey = (): string => globalThis.crypto?.randomUUID?.() ?? `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

export interface Posted {
  status: number;
  error: string | null;
}

/** POST to the payments API with an optional Idempotency-Key; the refusal's stable code, or 'network'. */
export async function post(url: string, body: unknown, key?: string): Promise<Posted> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { status: res.status, error: res.ok ? null : (data.error ?? 'other') };
  } catch {
    return { status: 0, error: 'network' };
  }
}

/** A refusal in words (`err.<CODE>`), or the general one. */
export const errWords = (w: Words, code: string | null) => (code && w[`err.${code}`]) || w['err.other'] || code || '';

type Step = 'approve' | 'reject' | 'complete' | 'fail';

export interface RefundActionsProps {
  w: Words;
  id: string;
  status: string;
  method: string;
  amount: string;
  canApprove: boolean;
  canExecute: boolean;
  /** The owner allows store credit instead, and the order has a customer: the approve form offers the wallet. */
  walletChoice: boolean;
  /** Four eyes is on and this person asked for it: he may not approve it. */
  ownRequest: boolean;
  testId: string;
}

export function RefundActions(p: RefundActionsProps) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState<Step | null>(null);
  const [note, setNote] = useState('');
  const [ref, setRef] = useState('');
  const [toWallet, setToWallet] = useState(p.method === 'wallet');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [key, setKey] = useState(newKey);
  const wallet = p.method === 'wallet';
  const steps: Step[] = [];
  if (p.status === 'REQUESTED' && p.canApprove) steps.push('approve', 'reject');
  if ((p.status === 'APPROVED' || p.status === 'FAILED') && p.canExecute) steps.push('complete');
  if (p.status === 'APPROVED' && p.canExecute && !wallet) steps.push('fail');
  if (p.status === 'APPROVED' && p.canApprove) steps.push('reject');
  if (!steps.length) return null;

  const start = (s: Step) => {
    setOpen(open === s ? null : s);
    setNote('');
    setRef('');
    setSure(false);
    setSaid(null);
  };
  const needsSure = open === 'approve' || open === 'complete';
  const needsNote = open === 'reject' || open === 'fail';
  const needsRef = open === 'complete' && !wallet;
  const ready = !busy && (!needsSure || sure) && (!needsNote || note.trim().length >= 3) && (!needsRef || ref.trim().length >= 3) && !(open === 'approve' && p.ownRequest);

  async function go() {
    if (!open || !ready) return;
    setBusy(true);
    const url = `/api/admin/payments/refunds/${p.id}/${open}`;
    const body =
      open === 'approve'
        ? { confirm: true, ...(p.walletChoice ? { method: toWallet ? 'wallet' : 'original' } : {}), ...(note.trim() ? { note: note.trim() } : {}) }
        : open === 'complete'
          ? { confirm: true, ...(wallet ? {} : { reference: ref.trim() }), ...(note.trim() ? { note: note.trim() } : {}) }
          : { note: note.trim() };
    const a = await post(url, body, open === 'complete' ? key : undefined);
    setBusy(false);
    if (!a.error) {
      setKey(newKey());
      setOpen(null);
      setSaid({ text: p.w[`done.${open}`] ?? '', bad: false });
      return router.refresh();
    }
    setSaid({ text: errWords(p.w, a.error), bad: true });
  }

  return (
    <div className="rf-act" data-testid={p.testId}>
      <div className="a2-gap8">
        {steps.map((s, i) => (
          <button key={`${s}-${i}`} type="button" className={`a2-btn sm${s === 'approve' || s === 'complete' ? ' pri' : ''}`} aria-expanded={open === s} aria-controls={`${id}-f`} onClick={() => start(s)} data-testid={`${p.testId}-${s}`}>
            {p.w[`btn.${s}${s === 'complete' && wallet ? 'Wallet' : ''}`]}
          </button>
        ))}
      </div>
      {open ? (
        <div className="rf-form a2-mt6" id={`${id}-f`} data-testid={`${p.testId}-form`}>
          <p className="a2-xs">{fill(p.w[`what.${open}${open === 'complete' && wallet ? 'Wallet' : ''}`], { amount: p.amount })}</p>
          {open === 'approve' && p.ownRequest ? <p className="a2-xs bk-warn">{p.w['err.SAME_PERSON']}</p> : null}
          {open === 'approve' && p.walletChoice ? (
            <label className="a2-chkl">
              <input type="checkbox" className="a2-chk" checked={toWallet} disabled={busy} onChange={(e) => setToWallet(e.target.checked)} data-testid={`${p.testId}-wallet`} />
              <span>{p.w['f.toWallet']}</span>
            </label>
          ) : null}
          {needsRef ? (
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-ref`}>
                {p.w['f.reference']}
              </label>
              <input id={`${id}-ref`} className="a2-inp" maxLength={100} autoComplete="off" value={ref} disabled={busy} onChange={(e) => setRef(e.target.value)} data-testid={`${p.testId}-ref`} />
            </div>
          ) : null}
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-note`}>
              {needsNote ? p.w['f.reason'] : p.w['f.note']}
            </label>
            <input id={`${id}-note`} className="a2-inp" maxLength={500} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} data-testid={`${p.testId}-note`} />
          </div>
          {needsSure ? (
            <label className="a2-chkl">
              <input type="checkbox" className="a2-chk" checked={sure} disabled={busy} onChange={(e) => setSure(e.target.checked)} data-testid={`${p.testId}-sure`} />
              <span>{fill(p.w['f.sure'], { amount: p.amount })}</span>
            </label>
          ) : null}
          <div className="a2-gap8 a2-mt6">
            <button type="button" className={`a2-btn sm${open === 'reject' || open === 'fail' ? ' badf' : ' pri'}`} disabled={!ready} onClick={go} data-testid={`${p.testId}-go`}>
              {busy ? p.w.working : p.w[`go.${open}`]}
            </button>
            <button type="button" className="a2-btn sm" disabled={busy} onClick={() => setOpen(null)}>
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

export interface ApologyGiveProps {
  w: Words;
  orderId: string;
  /** RULE: the rule's amount (no amount to type); PER_ORDER: the person types it. */
  mode: string;
  ruleAmount: string | null;
  digits: number;
  currency: string;
  testId: string;
}

/** The late-delivery apology credit on one order (`payments.apology`; `payments.wallet.apology` must be on). */
export function ApologyGive(p: ApologyGiveProps) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const rule = p.mode === 'RULE';
  const typed = rule ? null : typedMinor(amount, p.digits);
  const ready = !busy && sure && (rule || (typed !== null && typed > 0));
  async function go() {
    if (!ready) return;
    setBusy(true);
    const a = await post(`/api/admin/payments/orders/${p.orderId}/apology`, { confirm: true, ...(rule ? {} : { amountMinor: typed }), ...(note.trim() ? { note: note.trim() } : {}) });
    setBusy(false);
    if (!a.error) {
      setOpen(false);
      setSaid({ text: p.w['done.apology'] ?? '', bad: false });
      return router.refresh();
    }
    setSaid({ text: errWords(p.w, a.error), bad: true });
  }
  return (
    <div className="rf-act" data-testid={p.testId}>
      <button type="button" className="a2-btn sm" aria-expanded={open} aria-controls={`${id}-f`} onClick={() => setOpen(!open)} data-testid={`${p.testId}-open`}>
        {p.w['btn.apology']}
      </button>
      {open ? (
        <div className="rf-form a2-mt6" id={`${id}-f`}>
          <p className="a2-xs">{rule ? fill(p.w['what.apologyRule'], { amount: p.ruleAmount ?? '' }) : p.w['what.apology']}</p>
          {!rule ? (
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-amt`}>
                {p.w['f.amount']} ({p.currency})
              </label>
              <input id={`${id}-amt`} className="a2-inp" inputMode="decimal" autoComplete="off" value={amount} disabled={busy} onChange={(e) => setAmount(e.target.value)} data-testid={`${p.testId}-amount`} />
            </div>
          ) : null}
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-note`}>
              {p.w['f.note']}
            </label>
            <input id={`${id}-note`} className="a2-inp" maxLength={500} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} data-testid={`${p.testId}-note`} />
          </div>
          <label className="a2-chkl">
            <input type="checkbox" className="a2-chk" checked={sure} disabled={busy} onChange={(e) => setSure(e.target.checked)} data-testid={`${p.testId}-sure`} />
            <span>{p.w['f.sureApology']}</span>
          </label>
          <div className="a2-gap8 a2-mt6">
            <button type="button" className="a2-btn sm pri" disabled={!ready} onClick={go} data-testid={`${p.testId}-go`}>
              {busy ? p.w.working : p.w['go.apology']}
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
