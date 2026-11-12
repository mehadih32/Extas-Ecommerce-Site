'use client';
// S13 · PR 548 — "Links you follow": the owner's own list of followed shops' public pages. Adding a link reads it at
// once (the same "no separate preview step" shape PR 529's "Write from a link" already has); each row's own "Check
// now" re-reads it outside its schedule; "Archive"/"Restore" stop or resume following a link — kept, never deleted
// (hard rule 3). Without `marketing.campaigns.write` the list is read-only and the form is hidden.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { t, type Dict } from '@/lib/i18n';
import type { CompetitorRow } from '@/lib/marketing/intel';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

const API = '/api/admin/marketing/intel';
const URL_MAX = 2000;

export function IntelLinksCard(p: { words: Dict; links: readonly (CompetitorRow & { agoText: string })[]; linksMax: number; canWrite: boolean }) {
  const id = useId();
  const router = useRouter();
  const l = (k: string, vars?: Record<string, string | number>) => t(p.words, `in.${k}`, vars);
  const [url, setUrl] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const active = p.links.filter((x) => !x.archived);
  const atMax = active.length >= p.linksMax;

  async function act(body: { url: string } | { id: string; action: 'check' | 'archive' | 'restore' }, key: string, okMsg: string) {
    setBusyId(key);
    setSaid(null);
    const a = await call('POST', API, body);
    setBusyId(null);
    if (a.status === 200) {
      showToast({ text: okMsg, tone: 'ok' });
      setUrl('');
      router.refresh();
      return;
    }
    const code = a.status === 0 ? 'network' : a.status === 401 ? 'unauthorized' : (a.data.error ?? 'other');
    const txt = l(`err_${code}`);
    setSaid(txt === `in.err_${code}` ? l('err_other') : txt);
  }

  return (
    <section className="lm-card" aria-labelledby="in-l-h" data-testid="in-links">
      <h2 className="lm-h2" id="in-l-h">
        {l('links')}
      </h2>
      <p className="gg-span">{l('linksSub')}</p>
      {p.links.length ? (
        <ul className="in-list" data-testid="in-list">
          {p.links.map((r) => (
            <li key={r.id} className={`a2-prow${r.archived ? ' in-off' : ''}`} data-testid="in-row">
              <span className="a2-tki mute">
                <ShellIcon name="globe" size={16} />
              </span>
              <div className="a2-prt">
                <b>{r.name}</b>
                <span>{r.lastRunAt ? l('matched', { n: r.matched }) : l('neverRead')}{r.change && r.change !== 'none' && r.change !== 'first' ? ` · ${l(`chg_${r.change}`)}` : ''}</span>
              </div>
              <span className="a2-pru">{r.agoText}</span>
              {p.canWrite ? (
                <div className="in-acts">
                  {r.archived ? (
                    <button type="button" className="lm-btn sm" disabled={!!busyId} aria-busy={busyId === r.id} onClick={() => void act({ id: r.id, action: 'restore' }, r.id, l('restored'))}>
                      {l('restore')}
                    </button>
                  ) : (
                    <>
                      <button type="button" className="lm-btn sm" disabled={!!busyId} aria-busy={busyId === `${r.id}c`} onClick={() => void act({ id: r.id, action: 'check' }, `${r.id}c`, l('checked'))}>
                        {l('checkNow')}
                      </button>
                      <button type="button" className="lm-btn sm" disabled={!!busyId} aria-busy={busyId === `${r.id}a`} onClick={() => void act({ id: r.id, action: 'archive' }, `${r.id}a`, l('archived'))}>
                        {l('archive')}
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="gg-span" data-testid="in-empty">
          {l('empty')}
        </p>
      )}
      {p.canWrite ? (
        <form
          className="in-add"
          data-testid="in-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!atMax && url.trim()) void act({ url: url.trim() }, 'add', l('added'));
          }}
        >
          <label className="a2-sr" htmlFor={`${id}-url`}>
            {l('url')}
          </label>
          <input id={`${id}-url`} className="a2-inp" type="url" maxLength={URL_MAX} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} disabled={!!busyId || atMax} required data-testid="in-url" />
          <button type="submit" className="lm-btn pri" disabled={!!busyId || atMax || !url.trim()} data-testid="in-add">
            <ShellIcon name="plus" size={16} />
            {busyId === 'add' ? l('adding') : l('add')}
          </button>
        </form>
      ) : null}
      {atMax ? (
        <p className="gg-span" data-testid="in-maxed">
          {l('maxed', { n: p.linksMax })}
        </p>
      ) : null}
      {said ? (
        <p className="a2-sm a2-bad" role="status" data-testid="in-said">
          {said}
        </p>
      ) : null}
    </section>
  );
}
