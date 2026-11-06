'use client';
// S02 · PR 597 follow-up (695; demo WEB-02 "Save snapshot" / "Snapshots" card) — one page's own snapshots, in the Lumen
// look, under Website › Page layouts (each page, one category) and Website › Side canvas: "Save snapshot" keeps the page
// as it is saved now under a name; "Restore" asks first and says what happens (the page as it is now is saved first,
// newer sections and zones stay switched off, unsaved changes on the page are lost, money never changes). One call per
// step (POST /api/admin/website/snapshots, `website.layout.write`; the API checks again). lib/website/page-snapshots.ts.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';
import type { PageRestoreDone, PageSnapRow, PageSnapView } from '@/lib/website/page-snapshots';
import './page-snapshots.css';

const API = '/api/admin/website/snapshots';
const NAME_MAX = 80; // hardcode-ok: the name's length limit (the API's own)

type Dict = { [k: string]: string | Dict };
type Ask = { kind: 'save' } | { kind: 'restore'; snap: PageSnapRow };

export function PageSnapshots(p: { view: PageSnapView; canEdit: boolean; lang: 'en' | 'bn'; tz: string; w: Dict }) {
  const router = useRouter();
  const uid = useId();
  const g = (k: string, vars: Record<string, string | number> = {}): string => {
    const v = k.split('.').reduce<string | Dict | undefined>((o, part) => (o && typeof o === 'object' ? o[part] : undefined), p.w);
    return typeof v === 'string' ? Object.entries(vars).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, String(b)), v) : k;
  };
  const fmt = new Intl.DateTimeFormat(p.lang === 'bn' ? 'bn-BD-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: p.tz });
  const when = (iso: string) => fmt.format(new Date(iso));
  const [ask, setAsk] = useState<Ask | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const v = p.view;

  const label = (s: PageSnapRow) => (s.before !== null ? g('before', { name: s.before }) : s.name);

  async function run(body: Record<string, unknown>, ok: (r: { done?: PageRestoreDone }) => string) {
    setBusy(true);
    try {
      const res = await fetch(API, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, place: v.place, version: v.version }) });
      const a = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; done?: PageRestoreDone };
      if (res.ok && a.ok) {
        showToast({ text: ok(a), tone: 'ok' });
        setAsk(null);
      } else {
        const code = a.error ?? 'other';
        showToast({ text: g(`err.${code}`) === `err.${code}` ? g('err.other') : g(`err.${code}`), tone: 'bad' });
      }
      router.refresh();
    } catch {
      showToast({ text: g('err.network'), tone: 'bad' });
    } finally {
      setBusy(false);
    }
  }

  const box = (a: Ask) => {
    const qid = `${uid}-q`;
    const go = () =>
      a.kind === 'save'
        ? void run({ action: 'save', name: name.trim() }, () => g('done.saved', { name: name.trim() }))
        : void run({ action: 'restore', id: a.snap.id }, (r) => [g('done.restored', { name: label(a.snap) }), ...(r.done?.hidden ? [g('done.hidden', { n: r.done.hidden })] : [])].join(' '));
    const effects = a.kind === 'save' ? [g('ask.saveNote')] : [g('ask.first'), g('ask.kept'), g('ask.draft'), g('ask.money')];
    return (
      <div className="lm-ask psx-ask" role="alertdialog" aria-labelledby={qid} data-testid="ps-ask">
        <p id={qid}>
          <b>{a.kind === 'save' ? g('ask.saveTitle') : g('ask.restoreTitle', { name: label(a.snap) })}</b>
        </p>
        <ul className="psx-eff">
          {effects.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        {a.kind === 'save' ? (
          <div className="lm-fl psx-fl">
            <label htmlFor={`${uid}-n`}>{g('ask.name')}</label>
            <input id={`${uid}-n`} className="lm-inp" maxLength={NAME_MAX} value={name} placeholder={g('ask.nameHint')} onChange={(e) => setName(e.target.value)} data-testid="ps-name" />
          </div>
        ) : null}
        <div>
          <button type="button" className="lm-btn sm gh" onClick={() => setAsk(null)} disabled={busy}>
            {g('ask.no')}
          </button>
          <button type="button" className="lm-btn sm pri" onClick={go} disabled={busy || (a.kind === 'save' && !name.trim())} data-testid="ps-yes">
            {a.kind === 'save' ? g('ask.save') : g('restore')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="lm-card psx-card" aria-labelledby={`${uid}-h`} data-testid="ps-card">
      <h2 id={`${uid}-h`}>{g('title')}</h2>
      <p className="lm-sub">{g('sub')}</p>
      {p.canEdit ? (
        <div className="psx-bar">
          <button
            type="button"
            className="lm-btn"
            disabled={busy}
            onClick={() => {
              setName(g('defaultName', { at: when(new Date().toISOString()) }));
              setAsk({ kind: 'save' });
            }}
            data-testid="ps-save"
          >
            {g('save')}
          </button>
        </div>
      ) : null}
      {ask?.kind === 'save' ? box(ask) : null}
      {v.snaps.length ? (
        <ul className="psx-list">
          {v.snaps.map((s) => (
            <li key={s.id} className="psx-li" data-testid="ps-row" data-id={s.id}>
              <div className="psx-row">
                <div className="psx-name">
                  <b>
                    {label(s)}
                    {s.before !== null ? <span className="psx-tag">{g('tagAuto')}</span> : null}
                  </b>
                  <span className="lm-hint">{[s.by ?? g('someone'), when(s.at)].join(' · ')}</span>
                </div>
                {p.canEdit ? (
                  <button type="button" className="lm-btn sm" disabled={busy} onClick={() => setAsk({ kind: 'restore', snap: s })} data-testid={`ps-restore-${s.id}`}>
                    {g('restore')}
                  </button>
                ) : null}
              </div>
              {ask?.kind === 'restore' && ask.snap.id === s.id ? box(ask) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="lm-hint" data-testid="ps-none">
          {g('none')}
        </p>
      )}
    </section>
  );
}
