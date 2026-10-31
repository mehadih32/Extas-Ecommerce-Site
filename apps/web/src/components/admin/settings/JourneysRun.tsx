'use client';
// S21 · PR 414 — "Run now" on Reports › Site health: records the press (POST {action: 'run'}); the server's hourly
// check starts the saved browser journeys and the page shows the run when it is done. The words come from the page;
// the API checks `settings.write` again.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';

export interface JourneysRunTexts {
  run: string;
  running: string;
  asked: string;
  waiting: string;
  err: Record<string, string>;
}

export function JourneysRun({ url, texts: x, waiting }: { url: string; texts: JourneysRunTexts; waiting: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);

  async function run() {
    setBusy(true);
    setSaid(null);
    const a = await call('POST', url, { action: 'run' });
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: x.asked, bad: false });
      router.refresh();
      return;
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    setSaid({ text: x.err[code] ?? x.err.other ?? code, bad: true });
  }

  return (
    <div className="a2-gap8">
      <button type="button" className="a2-btn pri" disabled={busy || waiting} onClick={run} data-testid="journeys-run">
        {busy ? x.running : x.run}
      </button>
      <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="journeys-run-status">
        {said?.text ?? (waiting ? x.waiting : '')}
      </span>
    </div>
  );
}
