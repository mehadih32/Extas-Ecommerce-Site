'use client';
// S13 · PR 255 — an own landing page template's Archive (asks once more) or Restore, at the version it was read at
// (STALE = someone changed it; the page is read again). Nothing is deleted; pages made from it keep their own parts.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';

const API = '/api/admin/marketing/landing-templates';

export function LandingTemplateActions(p: { words: Dict; id: string; version: string; archived: boolean }) {
  const router = useRouter();
  const c = (k: string) => t(p.words, `lp.${k}`);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [bad, setBad] = useState<string | null>(null);
  const action = p.archived ? 'restore' : 'archive';

  async function go() {
    if (action === 'archive' && !ask) return setAsk(true);
    setAsk(false);
    setBusy(true);
    setBad(null);
    const a = await call('POST', `${API}/${p.id}`, { action, version: p.version });
    setBusy(false);
    if (a.status === 200) return router.refresh();
    const code = a.status === 0 ? 'network' : a.status === 401 ? 'unauthorized' : a.status === 403 ? 'forbidden' : (a.data.error ?? 'other');
    const txt = c(`err.${code}`);
    setBad(txt === `lp.err.${code}` ? c('err.other') : txt);
    if (a.status === 409 && a.data.error === 'STALE') router.refresh();
  }

  return (
    <>
      <button type="button" className={`a2-btn${ask ? ' pri' : ''}`} disabled={busy} onClick={go} data-testid={`lpt-${action}`}>
        {ask ? c('t.archiveConfirm') : c(`t.${action}`)}
      </button>
      {bad ? (
        <span className="a2-xs bk-warn" role="alert">
          {bad}
        </span>
      ) : null}
    </>
  );
}
