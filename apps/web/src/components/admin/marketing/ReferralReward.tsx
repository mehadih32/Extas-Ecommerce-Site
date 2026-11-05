'use client';
// S13 · PR 273 — Marketing › Referrals: "Give reward" on one delivered friend's order, after a confirm that names the
// amount and the customer (POST {action: 'reward', id, confirm: true} to /api/admin/marketing/referrals; the wallet
// permission). The page refreshes with the reward given.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';

export interface ReferralRewardTexts {
  give: string;
  confirm: string;
  yes: string;
  cancel: string;
  given: string;
  err: Record<string, string>;
}

export function ReferralReward({ url, id, texts: x }: { url: string; id: string; texts: ReferralRewardTexts }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ text: string; bad: boolean } | null>(null);
  async function go() {
    setBusy(true);
    const a = await call('POST', url, { action: 'reward', id, confirm: true });
    setBusy(false);
    setAsk(false);
    if (a.status !== 200) {
      const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
      return setOut({ text: x.err[code] ?? x.err.other ?? code, bad: true });
    }
    setOut({ text: x.given, bad: false });
    router.refresh();
  }
  return (
    <div className="adp-ctl-body">
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy} onClick={() => (setOut(null), setAsk(true))} data-testid="ref-give">
          {x.give}
        </button>
      </div>
      {ask ? (
        <div className="adp-confirm" role="alertdialog" aria-label={x.confirm} data-testid="ref-confirm">
          <p className="a2-sm">{x.confirm}</p>
          <div className="adp-read">
            <button type="button" className="a2-btn pri" disabled={busy} onClick={() => void go()} data-testid="ref-confirm-yes">
              {x.yes}
            </button>
            <button type="button" className="a2-btn" disabled={busy} onClick={() => setAsk(false)}>
              {x.cancel}
            </button>
          </div>
        </div>
      ) : null}
      {out ? (
        <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid="ref-said">
          {out.text}
        </span>
      ) : null}
    </div>
  );
}
