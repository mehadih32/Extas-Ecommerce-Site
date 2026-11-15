'use client';
// Parity round 3, lane F6 · PR 865 (prototype v5 Marketing › Ad campaigns › one campaign): the page's four buttons — Pause or
// Resume, Duplicate and Change budget — and the list's "Refresh". Every one goes through the existing, tested paths: a pause or a
// lower budget is sent after a confirm; Resume and a higher budget wait for the owner's approval (POST /ad-platforms/control,
// action 'change', confirm); Duplicate makes an open DRAFT copy that only starts after its own launch approval (POST
// /ad-platforms/campaigns, action 'duplicate'); Refresh reads spend and results from the ad accounts (POST /ad-platforms/spend,
// read-only on the platforms). Nothing here moves money by itself. Words come from the page.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export interface ActionTexts {
  pause: string;
  resume: string;
  duplicate: string;
  budget: string;
  budgetH: string;
  budgetNow: string;
  budgetLabel: string;
  budgetMin: string;
  budgetSame: string;
  next: string;
  yes: string;
  cancel: string;
  confirm: { pause: string; resume: string; down: string; up: string; duplicate: string };
  said: Record<string, string>;
  err: Record<string, string>;
  duplicated: string;
  openDrafts: string;
  needsControl: string;
}

export interface ActionProps {
  adCampaignId: string;
  name: string;
  paused: boolean;
  dailyBudgetMinor: number | null;
  scale: number;
  currency: string;
  locale: string;
  controlUrl: string;
  builderUrl: string;
  draftsHref: string;
  /** may change a campaign (`marketing.ads.control`), and the controls and the builder are switched on. */
  canControl: boolean;
  controlOn: boolean;
  builderOn: boolean;
  texts: ActionTexts;
}

type Outcome = { text: string; bad: boolean } | null;
interface Ask {
  text: string;
  run(): Promise<Outcome>;
}

export function AdCampaignActions({ adCampaignId, name, paused, dailyBudgetMinor, scale, currency, locale, controlUrl, builderUrl, draftsHref, canControl, controlOn, builderOn, texts: x }: ActionProps) {
  const router = useRouter();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ text: string; bad: boolean } | null>(null);
  const [panel, setPanel] = useState(false);
  const [budget, setBudget] = useState('');
  const fmt = (v: number) => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', numberingSystem: 'latn', maximumFractionDigits: v % scale === 0 ? 0 : 2 }).format(v / scale);
    } catch {
      return `${v / scale} ${currency}`;
    }
  };
  const errOf = (a: { status: number; data: Record<string, unknown> }) => x.err[a.status === 0 ? 'network' : String(a.data.error ?? 'other')] ?? x.err.other ?? '';
  const change = (body: Record<string, unknown>) => async () => {
    const a = await call('POST', controlUrl, { action: 'change', adCampaignId, ...body, confirm: true });
    if (a.status !== 200) return { text: errOf(a), bad: true };
    const st = String(a.data.status ?? '');
    return { text: x.said[st] ?? st, bad: st === 'FAILED' };
  };
  const duplicate = async () => {
    const a = await call('POST', builderUrl, { action: 'duplicate', adCampaignId });
    if (a.status !== 200) return { text: errOf(a), bad: true };
    return { text: x.duplicated, bad: false };
  };
  const go = async () => {
    if (!ask) return;
    setBusy(true);
    const r = await ask.run();
    setBusy(false);
    setAsk(null);
    setOut(r);
    if (r && !r.bad) router.refresh();
  };
  const pick = (a: Ask) => {
    setOut(null);
    setAsk(a);
  };
  const nowTaka = dailyBudgetMinor === null ? null : dailyBudgetMinor / scale;
  const typed = Number(budget);
  const minor = budget !== '' && Number.isFinite(typed) && typed > 0 ? Math.round(typed * scale) : null;
  const quick = (pct: number) => {
    if (nowTaka === null) return;
    setBudget(String(Math.round((nowTaka * (1 + pct / 100)) / 10) * 10)); // hardcode-ok: the prototype rounds a quick change to the nearest 10
  };
  const continueBudget = () => {
    if (minor === null) return setOut({ text: x.budgetMin, bad: true });
    if (minor === dailyBudgetMinor) return setOut({ text: x.budgetSame, bad: false });
    const down = dailyBudgetMinor !== null && minor < dailyBudgetMinor;
    pick({ text: fill(down ? x.confirm.down : x.confirm.up, { name, from: dailyBudgetMinor === null ? '–' : fmt(dailyBudgetMinor), to: fmt(minor) }), run: change({ change: 'budget', dailyBudgetMinor: minor }) });
    setPanel(false);
  };
  const off = !canControl;
  return (
    <div className="lf6-act" data-testid="ac1-actions">
      <div className="lf6-btns">
        {paused ? (
          <button type="button" className="a2-btn" disabled={busy || off || !controlOn} onClick={() => pick({ text: fill(x.confirm.resume, { name }), run: change({ change: 'resume' }) })} data-testid="ac1-resume">
            {x.resume}
          </button>
        ) : (
          <button type="button" className="a2-btn" disabled={busy || off || !controlOn} onClick={() => pick({ text: fill(x.confirm.pause, { name }), run: change({ change: 'pause' }) })} data-testid="ac1-pause">
            {x.pause}
          </button>
        )}
        <button type="button" className="a2-btn" disabled={busy || off || !builderOn} onClick={() => pick({ text: fill(x.confirm.duplicate, { name }), run: duplicate })} data-testid="ac1-duplicate">
          {x.duplicate}
        </button>
        <button type="button" className="a2-btn pri" disabled={busy || off || !controlOn} onClick={() => setPanel((v) => !v)} aria-expanded={panel} data-testid="ac1-budget">
          {x.budget}
        </button>
      </div>
      {off || !controlOn ? <p className="a2-xs a2-mute">{x.needsControl}</p> : null}
      {panel ? (
        <div className="lf6-panel" data-testid="ac1-budget-panel">
          <label className="a2-lbl" htmlFor="ac1-b">
            {x.budgetLabel}
          </label>
          <input id="ac1-b" className="a2-inp" type="number" inputMode="decimal" min={0} step="any" value={budget} onChange={(e) => setBudget(e.target.value)} data-testid="ac1-budget-input" />
          <p className="a2-xs a2-mute">{dailyBudgetMinor === null ? '' : fill(x.budgetNow, { day: fmt(dailyBudgetMinor), month: fmt(dailyBudgetMinor * 30) })}</p>
          <div className="lf6-btns">
            {[-20, 20, 50].map((q) => (
              <button key={q} type="button" className="a2-btn sm" onClick={() => quick(q)} disabled={nowTaka === null}>
                {q > 0 ? '+' : ''}
                {q}%
              </button>
            ))}
            <button type="button" className="a2-btn pri" onClick={continueBudget} data-testid="ac1-budget-next">
              {x.next}
            </button>
            <button type="button" className="a2-btn" onClick={() => setPanel(false)}>
              {x.cancel}
            </button>
          </div>
        </div>
      ) : null}
      {ask ? (
        <div className="adp-confirm" role="alertdialog" aria-label={ask.text} data-testid="ac1-confirm">
          <p className="a2-sm">{ask.text}</p>
          <div className="lf6-btns">
            <button type="button" className="a2-btn pri" disabled={busy} onClick={() => void go()} data-testid="ac1-confirm-yes">
              {x.yes}
            </button>
            <button type="button" className="a2-btn" disabled={busy} onClick={() => setAsk(null)}>
              {x.cancel}
            </button>
          </div>
        </div>
      ) : null}
      {out ? (
        <p className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid="ac1-said">
          {out.text}
          {out.text === x.duplicated ? (
            <>
              {' '}
              <a className="a2-lnk" href={draftsHref}>
                {x.openDrafts}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/** The list's "Refresh": reads spend and results from every ad account (read only on the platforms). */
export function RefreshAds({ url, label, working, done, failed }: { url: string; label: string; working: string; done: string; failed: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'bad'>('idle');
  const run = async () => {
    setState('busy');
    const a = await call('POST', url, {});
    setState(a.status === 200 ? 'done' : 'bad');
    if (a.status === 200) router.refresh();
  };
  return (
    <span className="lf6-refresh">
      <button type="button" className="a2-btn" onClick={() => void run()} disabled={state === 'busy'} data-testid="ac-refresh">
        {state === 'busy' ? working : label}
      </button>
      {state === 'done' ? (
        <span className="a2-xs a2-mute" role="status" data-testid="ac-refresh-said">
          {done}
        </span>
      ) : null}
      {state === 'bad' ? (
        <span className="a2-xs adp-bad" role="status">
          {failed}
        </span>
      ) : null}
    </span>
  );
}
