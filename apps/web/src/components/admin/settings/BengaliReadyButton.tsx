'use client';
// S11 · PR 588 — "Mark ready" / "Not ready" on Website › SEO › Bengali pages: POST {keys, ready, version} to the page's
// API (lib/seo/bengali-api.ts), then the page reads the list again. The words come from the page; the API checks
// `seo.manage` again and marks a page ready only when its Bengali text is there.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';

export interface BengaliReadyTexts {
  label: string;
  working: string;
  err: Record<string, string>;
}

export function BengaliReadyButton({ url, keys, ready, version, primary, testId, texts: x }: { url: string; keys: string[]; ready: boolean; version: string; primary?: boolean; testId: string; texts: BengaliReadyTexts }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');

  async function press() {
    setBusy(true);
    setSaid('');
    const a = await call('POST', url, { keys, ready, version });
    setBusy(false);
    if (a.status === 200) {
      router.refresh();
      return;
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    setSaid(x.err[code] ?? x.err.other ?? code);
    if (code === 'STALE') router.refresh();
  }

  return (
    <span className="bg-act">
      <button type="button" className={`a2-btn${primary ? ' pri' : ''}`} disabled={busy} onClick={press} data-testid={testId}>
        {busy ? x.working : x.label}
      </button>
      {said ? (
        <span className="a2-sm bg-err" role="status" aria-live="polite">
          {said}
        </span>
      ) : null}
    </span>
  );
}
