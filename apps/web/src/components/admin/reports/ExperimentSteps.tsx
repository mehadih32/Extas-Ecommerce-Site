'use client';
// S02 · PR 83 — the steps of one A/B test (Reports › Experiments): start, pause, end, keep the winner, archive, restore.
// Start, End, Keep and Archive ask once more on the same button (the confirm step of Blueprint rule 10: "start an A/B
// test"); each step sends the version the page was read at (STALE = the page is read again).
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface StepButton {
  action: string;
  winner?: 'a' | 'b';
  label: string;
  /** The words of the second press (empty: no second press). */
  ask: string;
  primary?: boolean;
}

export function ExperimentSteps(p: { api: string; version: string; steps: StepButton[]; err: Record<string, string>; done: string; testId: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const id = (s: StepButton) => `${s.action}${s.winner ?? ''}`;

  async function press(s: StepButton) {
    if (s.ask && ask !== id(s)) return setAsk(id(s));
    setAsk(null);
    setBusy(true);
    let status = 0;
    let data: { error?: string; details?: string[] } = {};
    try {
      const res = await fetch(p.api, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: s.action, version: p.version, ...(s.winner ? { winner: s.winner } : {}) }) });
      status = res.status;
      data = (await res.json().catch(() => ({ error: 'other' }))) as typeof data;
    } catch {
      data = { error: 'network' };
    }
    setBusy(false);
    if (status === 200) {
      setSaid({ text: p.done, bad: false });
      return router.refresh();
    }
    const text = (p.err[data.error ?? 'other'] ?? p.err.other ?? '').replace('{fields}', (data.details ?? []).join(', '));
    setSaid({ text, bad: true });
    if (status === 409 && data.error === 'STALE') router.refresh();
  }

  if (!p.steps.length) return null;
  return (
    <div className="xpb-steps" data-testid={p.testId}>
      <div className="a2-gap8 xpb-wrap">
        {p.steps.map((s) => (
          <button key={id(s)} type="button" className={`a2-btn${s.primary || ask === id(s) ? ' pri' : ''}`} disabled={busy} onClick={() => press(s)} data-testid={`xp-step-${id(s)}`}>
            {ask === id(s) ? s.ask : s.label}
          </button>
        ))}
      </div>
      {said ? (
        <p className={`a2-xs ${said.bad ? 'xpb-bad' : 'a2-mute'}`} role="status" data-testid="xp-said">
          {said.text}
        </p>
      ) : null}
    </div>
  );
}
