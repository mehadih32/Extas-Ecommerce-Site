'use client';
// S13 · PR 268 — Marketing › Ad platforms' campaign controls: each campaign's "Change" fold (Pause / Start again / a new
// daily budget), always through a confirm step that says whether it is sent now or waits for the owner, then POST
// {action: 'change', confirm: true}; and the owner's Approve / Reject of a waiting increase, again after a confirm
// (POST {action: 'decide', confirm: true}). The API checks the permission, the switch and the rule again; the page is
// read again after each. Words come from the page; the budget is typed in taka and sent in the minor unit (`scale`).
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { call } from '../api';

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export interface ControlTexts {
  fold: string;
  pause: string;
  resume: string;
  budget: string;
  budgetGo: string;
  confirm: { pause: string; resume: string; down: string; up: string };
  yes: string;
  cancel: string;
  said: Record<string, string>;
  err: Record<string, string>;
}

type Ask = { body: Record<string, unknown>; text: string };

function useAsk(url: string, said: Record<string, string>, err: Record<string, string>) {
  const router = useRouter();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ text: string; bad: boolean } | null>(null);
  async function go() {
    if (!ask) return;
    setBusy(true);
    const a = await call('POST', url, { ...ask.body, confirm: true });
    setBusy(false);
    setAsk(null);
    if (a.status !== 200) {
      const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
      setOut({ text: err[code] ?? err.other ?? code, bad: true });
      return;
    }
    const status = String(a.data.status ?? '');
    setOut({ text: said[status] ?? status, bad: status === 'FAILED' });
    router.refresh();
  }
  return { ask, setAsk, busy, out, setOut, go };
}

function Confirm({ ask, busy, yes, cancel, onYes, onNo, id }: { ask: Ask | null; busy: boolean; yes: string; cancel: string; onYes: () => void; onNo: () => void; id: string }) {
  if (!ask) return null;
  return (
    <div className="adp-confirm" role="alertdialog" aria-label={ask.text} data-testid={id}>
      <p className="a2-sm">{ask.text}</p>
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy} onClick={onYes} data-testid={`${id}-yes`}>
          {yes}
        </button>
        <button type="button" className="a2-btn" disabled={busy} onClick={onNo}>
          {cancel}
        </button>
      </div>
    </div>
  );
}

const Out = ({ out, id }: { out: { text: string; bad: boolean } | null; id: string }) =>
  out ? (
    <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid={id}>
      {out.text}
    </span>
  ) : null;

export function AdCampaignControl({ url, adCampaignId, name, paused, dailyBudgetMinor, scale, none, currency, locale, texts: x, children }: { url: string; adCampaignId: string; name: string; paused: boolean; dailyBudgetMinor: number | null; scale: number; none: string; currency: string; locale: string; texts: ControlTexts; children?: ReactNode }) {
  const { ask, setAsk, busy, out, setOut, go } = useAsk(url, x.said, x.err);
  const [budget, setBudget] = useState('');
  const n = Number(budget);
  const minor = budget !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * scale) : null;
  const fmt = (v: number) => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', numberingSystem: 'latn', minimumFractionDigits: v % scale === 0 ? 0 : undefined }).format(v / scale);
    } catch {
      return `${v / scale} ${currency}`;
    }
  };
  const from = dailyBudgetMinor === null ? none : fmt(dailyBudgetMinor);
  const pick = (b: Ask) => {
    setOut(null);
    setAsk(b);
  };
  return (
    <details className="a2-more-opts adp-ctl" data-testid="adp-ctl">
      <summary>{x.fold}</summary>
      <div className="adp-ctl-body">
        <div className="adp-read">
          {paused ? (
            <button type="button" className="a2-btn" disabled={busy} onClick={() => pick({ body: { action: 'change', adCampaignId, change: 'resume' }, text: fill(x.confirm.resume, { name }) })} data-testid="adp-ctl-resume">
              {x.resume}
            </button>
          ) : (
            <button type="button" className="a2-btn" disabled={busy} onClick={() => pick({ body: { action: 'change', adCampaignId, change: 'pause' }, text: fill(x.confirm.pause, { name }) })} data-testid="adp-ctl-pause">
              {x.pause}
            </button>
          )}
        </div>
        <div className="adp-rule-limit">
          <label className="a2-lbl" htmlFor={`adp-bud-${adCampaignId}`}>
            {x.budget}
          </label>
          <input id={`adp-bud-${adCampaignId}`} className="a2-inp" type="number" inputMode="decimal" min={0} step="any" value={budget} disabled={busy} onChange={(e) => setBudget(e.target.value)} data-testid="adp-ctl-budget" />
          <button
            type="button"
            className="a2-btn"
            disabled={busy || minor === null || minor === dailyBudgetMinor}
            onClick={() => minor !== null && pick({ body: { action: 'change', adCampaignId, change: 'budget', dailyBudgetMinor: minor }, text: fill(dailyBudgetMinor !== null && minor < dailyBudgetMinor ? x.confirm.down : x.confirm.up, { name, from, to: fmt(minor) }) })}
            data-testid="adp-ctl-budget-go"
          >
            {x.budgetGo}
          </button>
        </div>
        <Confirm ask={ask} busy={busy} yes={x.yes} cancel={x.cancel} onYes={() => void go()} onNo={() => setAsk(null)} id="adp-ctl-confirm" />
        <Out out={out} id="adp-ctl-said" />
        {/* PR 531: schedule and duplicate */}
        {children}
      </div>
    </details>
  );
}

export function AdControlDecide({ url, id, what, texts: x }: { url: string; id: string; what: string; texts: { approve: string; reject: string; confirmApprove: string; confirmReject: string; yes: string; cancel: string; said: Record<string, string>; err: Record<string, string> } }) {
  const { ask, setAsk, busy, out, setOut, go } = useAsk(url, x.said, x.err);
  const pick = (decision: 'approve' | 'reject') => {
    setOut(null);
    setAsk({ body: { action: 'decide', id, decision }, text: fill(decision === 'approve' ? x.confirmApprove : x.confirmReject, { what }) });
  };
  return (
    <div className="adp-ctl-body">
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy} onClick={() => pick('approve')} data-testid="adp-approve">
          {x.approve}
        </button>
        <button type="button" className="a2-btn" disabled={busy} onClick={() => pick('reject')} data-testid="adp-reject">
          {x.reject}
        </button>
      </div>
      <Confirm ask={ask} busy={busy} yes={x.yes} cancel={x.cancel} onYes={() => void go()} onNo={() => setAsk(null)} id="adp-decide-confirm" />
      <Out out={out} id="adp-decide-said" />
    </div>
  );
}
