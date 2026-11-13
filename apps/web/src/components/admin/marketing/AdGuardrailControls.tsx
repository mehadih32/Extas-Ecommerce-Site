'use client';
// S15 · PR 581 — Marketing › Ad platforms › Ads guardrails: "Decrease now" (POST {action: 'decreaseNow'}; every
// campaign over the cost-per-purchase cap, with auto-decrease allowed, is lowered at once — never waiting for
// approval). Same shape as Growth agent's "Run now" (GrowthControls.tsx).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export function GuardrailDecreaseNow({ url, texts: x }: { url: string; texts: { run: string; running: string; done: string; err: Record<string, string> } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ text: string; bad: boolean } | null>(null);
  async function go() {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, { action: 'decreaseNow' });
    setBusy(false);
    if (a.status !== 200) {
      const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
      setOut({ text: x.err[code] ?? x.err.other ?? code, bad: true });
      return;
    }
    showToast({ text: fill(x.done, { lowered: Number(a.data.lowered ?? 0), skipped: Number(a.data.skipped ?? 0) }), tone: 'ok' });
    router.refresh();
  }
  return (
    <div className="adp-read">
      <button type="button" className="a2-btn pri" disabled={busy} onClick={() => void go()} data-testid="adgr-decrease-now">
        {busy ? x.running : x.run}
      </button>
      {out ? (
        <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid="adgr-decrease-said">
          {out.text}
        </span>
      ) : null}
    </div>
  );
}
