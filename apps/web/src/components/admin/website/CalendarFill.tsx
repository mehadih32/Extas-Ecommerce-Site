'use client';
// S12 · PR 245 — the publish calendar's button: "Fill the free times" places every finished article with nothing
// missing in the free times of the days ahead (or `postId` alone: "Give it the next free time"), then says how many
// were placed and skipped and refreshes the calendar. Only for a publisher (`blog.publish`).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';

export function CalendarFill(p: { words: Dict; postId?: string; label: string; primary?: boolean; testId: string }) {
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.words, `jr.${k}`, vars);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);

  async function fill() {
    setBusy(true);
    const a = await call('POST', '/api/admin/blog/calendar', { action: 'fill', ...(p.postId ? { postId: p.postId } : {}) });
    setBusy(false);
    if (a.status === 200) {
      const placed = Number(a.data.placed ?? 0);
      const skipped = Number(a.data.skipped ?? 0);
      const free = Number(a.data.free ?? 0);
      const text = placed ? c('cal.placed', { n: placed }) + (skipped ? ` ${c('cal.skippedN', { n: skipped })}` : '') : skipped ? c('cal.skippedN', { n: skipped }) : free ? c('cal.noneReady') : c('cal.noFree');
      setSaid({ text, bad: !placed });
      return router.refresh();
    }
    const code = a.status === 0 ? 'network' : a.status === 401 ? 'unauthorized' : (a.data.error ?? 'other');
    const txt = c(`err.${code}`, { fields: (a.data.details ?? []).join(', ') });
    setSaid({ text: txt === `jr.err.${code}` ? c('err.other') : txt, bad: true });
  }

  return (
    <div className="cal-fill">
      <button type="button" className={`a2-btn${p.primary ? ' pri' : ''}`} disabled={busy} onClick={fill} data-testid={p.testId}>
        {p.label}
      </button>
      {said ? (
        <p className={`a2-sm jr-said${said.bad ? ' cal-bad' : ''}`} role="status">
          {said.text}
        </p>
      ) : null}
    </div>
  );
}
