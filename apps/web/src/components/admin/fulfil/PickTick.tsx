'use client';
// S20 · PR 405 — the picking list on screen (Orders › Packing & print › Picking list, ORD-04b): one size line as a
// large button the picker taps when he has pulled its pieces, and taps again to take the mark back. The server reads the
// line again from the list as it is now and keeps the orders it covered, so a line that gets a new order afterwards
// shows "more to pull" with the new order numbers. Words come from the page (no function crosses from the server).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '@/components/admin/api';
import { fulError } from '@/lib/admin-fulfil/words';
import type { Dict } from '@/lib/i18n';

export function PickTick({ dict, lineKey, state, label, sub, words, canTick }: { dict: Dict; lineKey: string; state: 'none' | 'done' | 'more'; label: string; sub: string; words: { done: string; more: string; tick: string; untick: string }; canTick: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    const a = await call('POST', '/api/admin/packing/picking/tick', { key: lineKey, ticked: state !== 'done' });
    setBusy(false);
    if (!a.data.ok) return setErr(a.status === 0 ? fulError(dict, 'network') : fulError(dict, a.data.error as string | undefined, ((a.data.details as string[] | undefined) ?? []).join(', ')));
    router.refresh();
  };
  return (
    <span className="a2-stack pk-line" style={{ gap: 2 }}>
      <button type="button" className={`pk-tick ${state}`} onClick={go} disabled={busy || !canTick} aria-pressed={state === 'done'} title={state === 'done' ? words.untick : words.tick} data-testid="picking-tick" data-state={state}>
        <span className="pk-box" aria-hidden="true">
          {state === 'done' ? '✓' : state === 'more' ? '+' : ''}
        </span>
        <span className="pk-txt">
          <b>{label}</b>
          <span className="a2-xs a2-mute">{sub}</span>
          {state === 'more' ? <span className="a2-xs" style={{ color: 'var(--warn, #8a5a00)' }}>{words.more}</span> : state === 'done' ? <span className="a2-xs a2-mute">{words.done}</span> : null}
        </span>
      </button>
      {err ? (
        <span className="a2-xs" role="alert" style={{ color: 'var(--bad)' }}>
          {err}
        </span>
      ) : null}
    </span>
  );
}
