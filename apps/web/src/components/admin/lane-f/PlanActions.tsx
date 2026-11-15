'use client';
// Parity round 3, lane F6 · PR 865 (prototype v5 Marketing › Plan & ideas) — the page's two buttons: "Use this plan" (asks, for each
// running campaign of a channel whose budget moves, for its new daily budget through the campaign controls: a lower one is sent
// after the confirm, a higher one waits for the owner's approval — nothing moves money by itself) and an idea's "Add to calendar"
// (a plan line on the marketing calendar). Words come from the page.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export interface PlanChange {
  adCampaignId: string;
  toMinor: number;
}

export function UsePlan({ url, changes, from, to, texts: x, disabled }: { url: string; changes: PlanChange[]; from: string; to: string; disabled: boolean; texts: { go: string; confirm: string; yes: string; cancel: string; done: string; none: string; err: string } }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ text: string; bad: boolean } | null>(null);
  const run = async () => {
    setBusy(true);
    let sent = 0;
    let waiting = 0;
    let failed = 0;
    for (const c of changes) {
      const a = await call('POST', url, { action: 'change', adCampaignId: c.adCampaignId, change: 'budget', dailyBudgetMinor: c.toMinor, confirm: true });
      if (a.status !== 200) failed += 1;
      else if (a.data.status === 'WAITING') waiting += 1;
      else sent += 1;
    }
    setBusy(false);
    setAsk(false);
    setOut({ text: fill(x.done, { sent, waiting, failed }), bad: failed > 0 && sent + waiting === 0 });
    router.refresh();
  };
  return (
    <div className="lf6-act">
      <div className="lf6-btns">
        <button type="button" className="a2-btn pri" disabled={disabled || busy || !changes.length} onClick={() => { setOut(null); setAsk(true); }} data-testid="pl-apply">
          {x.go}
        </button>
        {!changes.length ? <span className="a2-xs a2-mute">{x.none}</span> : null}
      </div>
      {ask ? (
        <div className="adp-confirm" role="alertdialog" aria-label={x.confirm} data-testid="pl-confirm">
          <p className="a2-sm">{fill(x.confirm, { from, to, n: changes.length })}</p>
          <div className="lf6-btns">
            <button type="button" className="a2-btn pri" disabled={busy} onClick={() => void run()} data-testid="pl-confirm-yes">
              {x.yes}
            </button>
            <button type="button" className="a2-btn" disabled={busy} onClick={() => setAsk(false)}>
              {x.cancel}
            </button>
          </div>
        </div>
      ) : null}
      {out ? (
        <p className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid="pl-said">
          {out.text}
        </p>
      ) : null}
    </div>
  );
}

export function IdeaButton({ url, idea, texts: x, on, disabled }: { url: string; idea: { title: string; titleBn: string; starts: string }; on: boolean; disabled: boolean; texts: { add: string; added: string; err: Record<string, string> } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(on);
  const [bad, setBad] = useState('');
  const add = async () => {
    setBusy(true);
    setBad('');
    const a = await call('POST', url, { action: 'plan.add', title: idea.title, titleBn: idea.titleBn, starts: idea.starts });
    setBusy(false);
    if (a.status !== 200) return setBad(x.err[String(a.data.error ?? 'other')] ?? x.err.other ?? '');
    setDone(true);
    router.refresh();
  };
  return (
    <span className="lf6-refresh">
      <button type="button" className="a2-btn sm" disabled={done || busy || disabled} onClick={() => void add()} data-testid="pl-idea-add">
        {done ? x.added : x.add}
      </button>
      {bad ? (
        <span className="a2-xs adp-bad" role="status">
          {bad}
        </span>
      ) : null}
    </span>
  );
}
