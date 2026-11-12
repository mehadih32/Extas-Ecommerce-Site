'use client';
// S24 · PR 458 (Blueprint C7.16 — "Review and approval UI with side-by-side and reasons") — the review decision's
// own client form: Approve, or Reject with a reason (required — "with reasons on rejection"). Posts to
// `/api/admin/marketing/photoshoot-review`, which records the decision through `decideOutputReview` and moves
// the job to APPROVED/REJECTED in the same call.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { showToast } from '../lumen/Toast';

const API = '/api/admin/marketing/photoshoot-review';

export interface ReviewFormTexts {
  err: Record<string, string>;
  reasonLabel: string;
  reasonHelp: string;
  reasonRequired: string;
  approve: string;
  reject: string;
  deciding: string;
  approved: string;
  rejected: string;
}

type Msg = { ok: boolean; text: string } | null;

export function PhotoshootReviewForm({ outputId, texts: w }: { outputId: string; texts: ReviewFormTexts }) {
  const uid = useId();
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  async function decide(decision: 'approve' | 'reject') {
    if (decision === 'reject' && !reason.trim()) {
      setMsg({ ok: false, text: w.reasonRequired });
      return;
    }
    setBusy(decision);
    setMsg(null);
    try {
      const res = await fetch(API, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outputId, decision, reason: decision === 'reject' ? reason.trim() : undefined }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string };
      if (!data.ok) {
        const code = data.error ?? (res.status === 403 ? 'forbidden' : res.status === 401 ? 'unauthorized' : 'other');
        setMsg({ ok: false, text: w.err[code] ?? w.err.other ?? code });
        return;
      }
      showToast({ text: decision === 'approve' ? w.approved : w.rejected, tone: 'ok' });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: w.err.network ?? w.err.other ?? 'network' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="a2-sc a2-mt12" aria-labelledby={`${uid}-h`} data-testid="prv-form">
      <h2 className="a2-h3" id={`${uid}-h`}>
        {w.reasonLabel}
      </h2>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-reason`}>
          {w.reasonLabel}
        </label>
        <textarea id={`${uid}-reason`} className="a2-inp" rows={3} value={reason} data-testid="prv-reason" onChange={(e) => setReason(e.target.value)} />
        <p className="a2-help">{w.reasonHelp}</p>
      </div>

      {msg ? (
        <p className="a2-xs" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }} data-testid="prv-msg">
          {msg.text}
        </p>
      ) : null}

      <div className="a2-gap8 yt-mt8">
        <button type="button" className="a2-btn pri" disabled={busy !== null} data-testid="prv-approve" onClick={() => decide('approve')}>
          {busy === 'approve' ? w.deciding : w.approve}
        </button>
        <button type="button" className="a2-btn bad" disabled={busy !== null} data-testid="prv-reject" onClick={() => decide('reject')}>
          {busy === 'reject' ? w.deciding : w.reject}
        </button>
      </div>
    </section>
  );
}
