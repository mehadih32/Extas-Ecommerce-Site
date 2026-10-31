'use client';
// S13 · PR 257 — Marketing › Tracking's two buttons: "Send test event" (one sample event to every platform in its test
// mode; a practice copy sends nothing out) and "Send waiting now". POST {action} to the page's API
// (lib/tracking/admin.ts), which checks `ads.tracking.manage` again; the answer says per platform what happened, and the
// page is read again. Words come from the page.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';

export interface TrackingActionTexts {
  label: string;
  working: string;
  /** `{platform}: {sent} sent, {mock} …, {failed} failed` */
  outcome: string;
  outcomeErr: string;
  outcomeNone: string;
  platforms: Record<string, string>;
  err: Record<string, string>;
}

type Tally = { sent: number; mock: number; failed: number; error?: string };

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export function TrackingActions({ url, action, events, eventLabel, testId, texts: x }: { url: string; action: 'test' | 'send'; events?: { value: string; label: string }[]; eventLabel?: string; testId: string; texts: TrackingActionTexts }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [event, setEvent] = useState(events?.[events.length - 1]?.value ?? '');
  const [lines, setLines] = useState<{ text: string; bad: boolean }[]>([]);

  async function press() {
    setBusy(true);
    setLines([]);
    const a = await call('POST', url, action === 'test' ? { action, event } : { action });
    setBusy(false);
    if (a.status !== 200) {
      const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
      setLines([{ text: x.err[code] ?? x.err.other ?? code, bad: true }]);
      return;
    }
    const per = ((a.data.outcome as { platforms?: Record<string, Tally> } | undefined)?.platforms ?? {}) as Record<string, Tally>;
    const out = Object.entries(per).map(([p, t]) => {
      const platform = x.platforms[p] ?? p;
      if (t.failed && t.error && !t.sent && !t.mock) return { text: fill(x.outcomeErr, { platform, error: t.error }), bad: true };
      return { text: fill(x.outcome, { platform, sent: t.sent, mock: t.mock, failed: t.failed }), bad: t.failed > 0 };
    });
    setLines(out.length ? out : [{ text: x.outcomeNone, bad: false }]);
    router.refresh();
  }

  return (
    <div className="trk-act">
      {events ? (
        <label className="trk-pick">
          <span className="a2-sm">{eventLabel}</span>
          <select className="a2-sel" value={event} onChange={(e) => setEvent(e.target.value)} disabled={busy} data-testid={`${testId}-event`}>
            {events.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button type="button" className="a2-btn pri" disabled={busy} onClick={press} data-testid={testId}>
        {busy ? x.working : x.label}
      </button>
      {lines.length ? (
        <ul className="trk-out a2-sm" role="status" aria-live="polite" data-testid={`${testId}-out`}>
          {lines.map((l, i) => (
            <li key={i} className={l.bad ? 'bad' : undefined}>
              {l.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
