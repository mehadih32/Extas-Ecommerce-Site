'use client';
// PR 620 — "The ERP asks the shop" on Keys & connections: the address to put into the ERP's shop settings, the switch
// (off as it ships; only someone who may change keys sees it work), whether the store speaks the new ERP contract yet,
// the store's latest verified calls (never a customer), and how many calls were refused lately (summed apart, so they
// never push the store's own calls out). API: /api/admin/integrations/erp-calls.
// p3 review round 2: the refused webhooks (the ERP's events to the shop) on their own line under it.
// CN-029 · PR 619 (follow-up 524): shown on the store's ERP link page; `storeId` makes every call that store's.
import { useState } from 'react';
import type { ErpCallsState } from '@/lib/erp-calls-admin';
import { t, type Dict } from '@/lib/i18n';
import { call, errorText } from './api';

interface Props {
  dict: Dict;
  initial: ErpCallsState;
  canWrite: boolean;
  locale: string;
  timeZone: string;
  /** The store the card serves (PR 619); absent = the mother store. */
  storeId?: number;
  /** qa-gate N3: `a2` draws the card in the new shell's look (Settings › ERP link); Keys & connections keeps its own. */
  look?: 'classic' | 'a2';
}

type Refused = Omit<ErpCallsState['refused'], 'lastAt'> & { lastAt: string | Date | null };
type Shown = Omit<ErpCallsState, 'calls' | 'refused' | 'refusedWebhooks'> & {
  calls: (Omit<ErpCallsState['calls'][number], 'at'> & { at: string | Date })[];
  refused: Refused;
  refusedWebhooks: Refused;
};

export function ErpCalls({ dict, initial, canWrite, locale, timeZone, storeId, look = 'classic' }: Props) {
  const a2 = look === 'a2';
  const [s, setS] = useState<Shown>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const when = (at: string | Date) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(at));
  const k = (key: string, vars?: Record<string, string>) => t(dict, `integrations.erpCalls.${key}`, vars);
  /** A refused count with its reasons, most first (or the "none" line). */
  const refusedLine = (r: Refused, some: string, none: string) =>
    r.total
      ? k(some, { n: String(r.total), days: String(r.days) }) +
        ` (${Object.entries(r.byCode)
          .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
          .map(([code, n]) => `${k(`code.${code}`)}: ${n}`)
          .join(' · ')})`
      : k(none, { days: String(r.days) });

  const flip = async () => {
    if (!canWrite || busy) return;
    setBusy(true);
    setError('');
    const a = await call('PUT', storeId == null ? '/api/admin/integrations/erp-calls' : `/api/admin/integrations/erp-calls?storeId=${storeId}`, { enabled: !s.enabled });
    setBusy(false);
    if (a.status === 200) setS(a.data as unknown as Shown);
    else setError(errorText(dict, a));
  };

  const card = (
    <section className={a2 ? 'a2-card ad-keys' : 'ad-card'} aria-labelledby="ad-erpcalls-h" id="erp-site-api" data-testid="erp-site-api" data-erp-calls={s.enabled ? 'on' : 'off'}>
      <h2 id="ad-erpcalls-h" className={a2 ? 'a2-h4' : undefined}>
        {k('title')}
      </h2>
      <div className={a2 ? 'a2-sm a2-mute a2-mt6' : 'ad-sub'}>{k('sub')}</div>
      <div className="ad-row">
        <div className="ad-row-main">
          <div className="ad-row-name">{k('base')}</div>
          {s.base ? (
            <code className="ad-mini" data-testid="erp-site-base" lang="en" translate="no">
              {s.base}
            </code>
          ) : (
            <div className="ad-mini">{k('baseUnknown')}</div>
          )}
          <div className="ad-mini">{k('baseHow')}</div>
        </div>
      </div>
      <div className="ad-row">
        <div className="ad-row-main">
          <label className="a2-swl">
            <span>
              <span className="ad-row-name">{k('switch')}</span>
              <span className="ad-mini">{k(s.enabled ? 'on' : 'off')}</span>
              {!s.v6 ? (
                <>
                  {' '}
                  <span className="ad-mini">{k('v5')}</span>
                </>
              ) : null}
            </span>
            <button type="button" className={`a2-sw${s.enabled ? ' on' : ''}`} role="switch" aria-checked={s.enabled} aria-label={k('switch')} disabled={!canWrite || busy} onClick={() => void flip()} data-testid="erp-calls-switch" />
          </label>
          {error ? (
            <p className="ad-modal-err" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      <h3 className="ad-row-name">{k('recent')}</h3>
      {s.calls.length ? (
        s.calls.map((c, i) => (
          <div className="ad-row" key={`${String(c.at)}-${i}`} data-testid="erp-call-row">
            <div className="ad-row-main">
              <div className="ad-mini" suppressHydrationWarning>
                {when(c.at)} · {k(`endpoint.${c.endpoint ?? 'unknown'}`)}
              </div>
              <div className={`ad-mini ${c.status < 300 ? 'ok' : 'bad'}`}>
                {k(`code.${c.code || 'SERVER_ERROR'}`)}
                {c.rows !== null ? ` · ${k('rows', { n: String(c.rows) })}` : ''}
                {c.searched ? ` · ${k('searched')}` : ''}
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="ad-mini" data-testid="erp-calls-none">
          {k('none')}
        </div>
      )}
      <div className={`ad-mini${s.refused.total ? ' bad' : ''}`} data-testid="erp-calls-refused">
        {refusedLine(s.refused, 'refused', 'refusedNone')}
      </div>
      <div className={`ad-mini${s.refusedWebhooks.total ? ' bad' : ''}`} data-testid="erp-calls-refused-webhooks">
        {refusedLine(s.refusedWebhooks, 'refusedHooks', 'refusedHooksNone')}
      </div>
    </section>
  );
  // In the new shell the rows keep the classic colours and sizes (`.ad`'s own variables), inside the shell's card.
  return a2 ? <div className="ad ad-embed">{card}</div> : card;
}
