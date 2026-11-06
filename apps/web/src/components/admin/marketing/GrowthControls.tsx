'use client';
// S13 · PR 269 — Marketing › Ad platforms › Growth agent: "Run now" (POST {action: 'run'}; the agent reads and proposes,
// nothing changes) with what it made, then the page is read again. The owner's Approve / Reject per proposal reuses the
// campaign controls' decide box (AdControlDecide, POST {action: 'decide', confirm: true}). Words come from the page.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export function GrowthRun({ url, texts: x }: { url: string; texts: { run: string; running: string; ran: string; err: Record<string, string> } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ text: string; bad: boolean } | null>(null);
  async function go() {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, { action: 'run' });
    setBusy(false);
    if (a.status !== 200) {
      const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
      setOut({ text: x.err[code] ?? x.err.other ?? code, bad: true });
      return;
    }
    showToast({ text: fill(x.ran, { made: Number(a.data.made ?? 0), waiting: Number(a.data.waiting ?? 0) }), tone: 'ok' });
    router.refresh();
  }
  return (
    <div className="adp-read">
      <button type="button" className="a2-btn pri" disabled={busy} onClick={() => void go()} data-testid="adg-run">
        {busy ? x.running : x.run}
      </button>
      {out ? (
        <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid="adg-run-said">
          {out.text}
        </span>
      ) : null}
    </div>
  );
}
