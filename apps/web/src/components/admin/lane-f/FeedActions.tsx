'use client';
// Parity round 3, lane F6 · PR 866 (prototype v5 Marketing › Shopping feed) — the page's buttons and switches. "Update feed now" asks
// the server for today's counts again (the feed is built fresh each time Google or Facebook fetches it; nothing is pushed), the two
// switches turn the Google and the Facebook feed on or off, "Mark all as own brand" and "Fill N descriptions" go through
// /api/admin/marketing/shopping-feed. Words come from the page.
import { LmSwitch } from '../settings/LmSwitch';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export interface FeedTexts {
  updated: string;
  ownDone: string;
  filled: string;
  googleOn: string;
  googleOff: string;
  fbOn: string;
  fbOff: string;
  err: string;
}

function useSay() {
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  return { said, setSaid };
}

const Said = ({ said }: { said: { text: string; bad: boolean } | null }) =>
  said ? (
    <p className={`a2-sm${said.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid="sf-said">
      {said.text}
    </p>
  ) : null;

export function UpdateFeedButton({ label, products, texts: x }: { label: string; products: number; texts: FeedTexts }) {
  const router = useRouter();
  const { said, setSaid } = useSay();
  const [busy, setBusy] = useState(false);
  return (
    <span className="lf6-refresh">
      <button
        type="button"
        className="a2-btn"
        disabled={busy}
        data-testid="sf-update"
        onClick={async () => {
          setBusy(true);
          const a = await call('GET', '/api/admin/marketing/merchant-feed');
          setBusy(false);
          setSaid(a.status === 200 ? { text: fill(x.updated, { n: products }), bad: false } : { text: x.err, bad: true });
          if (a.status === 200) router.refresh();
        }}
      >
        {label}
      </button>
      <Said said={said} />
    </span>
  );
}

export function FeedSwitch({ which, on, label, onLabel, offLabel, canWrite, texts: x, before }: { which: 'google' | 'fb'; on: boolean; label: string; onLabel: string; offLabel: string; canWrite: boolean; texts: FeedTexts; before: boolean }) {
  const router = useRouter();
  const { said, setSaid } = useSay();
  const [busy, setBusy] = useState(false);
  const flip = async (next: boolean) => {
    setBusy(true);
    const a = which === 'google' ? await call('PUT', '/api/admin/marketing/merchant-feed', { key: 'ads.merchantFeed', on: next, values: {} }) : await call('POST', '/api/admin/marketing/meta-feed/settings', { value: { on: next }, before: { on: before } });
    setBusy(false);
    if (a.status !== 200) return setSaid({ text: x.err, bad: true });
    setSaid({ text: which === 'google' ? (next ? x.googleOn : x.googleOff) : next ? x.fbOn : x.fbOff, bad: false });
    router.refresh();
  };
  return (
    <div className="lf6-li" data-testid={`sf-${which}`}>
      <b className="grow">{label}</b>
      <span className={`a2-pill ${on ? 'ok' : 'line'}`}>{on ? onLabel : offLabel}</span>
      <LmSwitch on={on} label={label} disabled={!canWrite || busy} onFlip={(next) => void flip(next)} testId={`sf-${which}-switch`} />
      <Said said={said} />
    </div>
  );
}

export function FeedAction({ action, label, texts: x, doneKey, testId }: { action: 'fillDescriptions' | 'ownBrand'; label: string; texts: FeedTexts; doneKey: 'filled' | 'ownDone'; testId: string }) {
  const router = useRouter();
  const { said, setSaid } = useSay();
  const [busy, setBusy] = useState(false);
  return (
    <span className="lf6-refresh">
      <button
        type="button"
        className={`a2-btn${action === 'ownBrand' ? ' pri' : ' sm'}`}
        disabled={busy}
        data-testid={testId}
        onClick={async () => {
          setBusy(true);
          const a = await call('POST', '/api/admin/marketing/shopping-feed', { action });
          setBusy(false);
          if (a.status !== 200) return setSaid({ text: x.err, bad: true });
          setSaid({ text: fill(x[doneKey], { n: Number(a.data.filled ?? a.data.brands ?? 0) }), bad: false });
          router.refresh();
        }}
      >
        {label}
      </button>
      <Said said={said} />
    </span>
  );
}
