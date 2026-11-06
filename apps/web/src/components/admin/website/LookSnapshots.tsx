'use client';
// S02 · PR 597 — Website › Launch default (demo WEB-07 "শুরুর চেহারা"), in the Lumen look: the launch default with
// "Back to launch default", the saved looks (save the look as it is now, restore, rename, set aside / bring back — never
// deleted), the restore log with "Undo" on the newest step, and what a look holds. Every restore asks first and says what
// happens: the look as it is now is saved first, newer sections, zones and house ads are kept switched off, back to the
// launch default pauses the running A/B tests, and prices, offers, delivery charges and COD never change. One call per
// step (POST /api/admin/website/launch-default, `website.layout.write`; the API checks again).
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';
import type { LookView, RestoreDone, SnapRow } from '@/lib/website/launch-default-admin';

const API = '/api/admin/website/launch-default';
const NAME_MAX = 80; // hardcode-ok: the name's length limit (the API's own)
const REASON_MAX = 200; // hardcode-ok: the reason's length limit (the API's own)

type Dict = { [k: string]: string | Dict };
type Ask = { kind: 'restore'; snap: SnapRow } | { kind: 'undo'; id: string } | { kind: 'save'; launch: boolean } | { kind: 'rename'; snap: SnapRow };

export function LookSnapshots(p: { view: LookView; canEdit: boolean; lang: 'en' | 'bn'; tz: string; w: Dict }) {
  const router = useRouter();
  const uid = useId();
  const g = (k: string, vars: Record<string, string | number> = {}): string => {
    const v = k.split('.').reduce<string | Dict | undefined>((o, part) => (o && typeof o === 'object' ? o[part] : undefined), p.w);
    return typeof v === 'string' ? Object.entries(vars).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, String(b)), v) : k;
  };
  const [ask, setAsk] = useState<Ask | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAside, setShowAside] = useState(false);
  const fmt = new Intl.DateTimeFormat(p.lang === 'bn' ? 'bn-BD-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: p.tz });
  const when = (iso: string) => fmt.format(new Date(iso));
  const v = p.view;

  const open = (a: Ask) => {
    setAsk(a);
    setText(a.kind === 'save' ? (a.launch ? g('launch.defaultName') : '') : a.kind === 'rename' ? a.snap.name : '');
  };

  async function run(body: Record<string, unknown>, ok: (r: { done?: RestoreDone }) => string) {
    setBusy(true);
    try {
      const res = await fetch(API, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, version: v.version }) });
      const a = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; done?: RestoreDone };
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

  const doneText = (key: string, name: string, d?: RestoreDone) => {
    const parts = [g(key, { name })];
    if (d) {
      parts.push(g('done.parts', { n: d.written.length }));
      if (d.hidden) parts.push(g('done.hidden', { n: d.hidden }));
      if (d.paused) parts.push(g('done.paused', { n: d.paused }));
      if (d.resumed) parts.push(g('done.resumed', { n: d.resumed }));
    }
    return parts.join(' ');
  };

  const label = (s: SnapRow) => (s.auto ? g(s.auto.kind === 'undo' ? 'auto.undo' : 'auto.restore', { name: s.name }) : s.name);

  const confirmBox = (a: Ask) => {
    const qid = `${uid}-q`;
    const canGo = !busy && (a.kind === 'save' || a.kind === 'rename' ? text.trim().length > 0 : true);
    const go = () => {
      if (a.kind === 'restore') void run({ action: 'restore', id: a.snap.launch ? 'launch' : a.snap.id, reason: text.trim() }, (r) => doneText('done.restored', label(a.snap), r.done));
      else if (a.kind === 'undo') void run({ action: 'undo', restoreId: a.id }, (r) => doneText('done.undone', '', r.done));
      else if (a.kind === 'save') void run({ action: 'save', name: text.trim(), launch: a.launch }, () => g(a.launch ? 'done.savedLaunch' : 'done.saved', { name: text.trim() }));
      else void run({ action: 'rename', id: a.snap.id, name: text.trim() }, () => g('done.renamed', { name: text.trim() }));
    };
    const title = a.kind === 'restore' ? g(a.snap.launch ? 'ask.launchTitle' : 'ask.restoreTitle', { name: label(a.snap) }) : a.kind === 'undo' ? g('ask.undoTitle') : a.kind === 'save' ? g(a.launch ? 'ask.saveLaunchTitle' : 'ask.saveTitle') : g('ask.renameTitle');
    const effects =
      a.kind === 'restore'
        ? [g('ask.first'), g('ask.kept'), ...(a.snap.launch ? [v.testsRunning ? g('ask.tests', { n: v.testsRunning }) : g('ask.noTests')] : []), g('ask.money')]
        : a.kind === 'undo'
          ? [g('ask.undoBack'), g('ask.first'), g('ask.money')]
          : a.kind === 'save'
            ? [g(a.launch ? 'ask.saveLaunchNote' : 'ask.saveNote')]
            : [];
    return (
      <div className="lm-ask ldx-ask" role="alertdialog" aria-labelledby={qid} data-testid="ld-ask">
        <p id={qid}>
          <b>{title}</b>
        </p>
        {effects.length ? (
          <ul className="ldx-eff">
            {effects.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
        {a.kind !== 'undo' ? (
          <div className="lm-fl ldx-fl">
            <label htmlFor={`${uid}-t`}>{a.kind === 'restore' ? g('ask.reason') : g('ask.name')}</label>
            <input
              id={`${uid}-t`}
              className="lm-inp"
              maxLength={a.kind === 'restore' ? REASON_MAX : NAME_MAX}
              value={text}
              placeholder={a.kind === 'restore' ? g('ask.reasonHint') : g('ask.nameHint')}
              onChange={(e) => setText(e.target.value)}
              data-testid="ld-ask-text"
            />
          </div>
        ) : null}
        <div>
          <button type="button" className="lm-btn sm gh" onClick={() => setAsk(null)} disabled={busy}>
            {g('ask.no')}
          </button>
          <button type="button" className="lm-btn sm pri" onClick={go} disabled={!canGo} data-testid="ld-ask-yes">
            {a.kind === 'restore' ? g('restore') : a.kind === 'undo' ? g('undo') : g('ask.save')}
          </button>
        </div>
      </div>
    );
  };

  const chips = (s: SnapRow) => (
    <span className="ldx-chips">
      <span className="ldx-tag">{g('sum.sections', { on: s.sum.sectionsOn, all: s.sum.sections })}</span>
      <span className="ldx-tag">{s.sum.canvasOn ? g('sum.canvasOn', { on: s.sum.zonesOn }) : g('sum.canvasOff')}</span>
      {s.sum.ownOn ? <span className="ldx-tag">{g('sum.own', { n: s.sum.ownOn })}</span> : null}
      {s.sum.ads ? <span className="ldx-tag">{g('sum.ads', { n: s.sum.ads })}</span> : null}
    </span>
  );

  const snapRow = (s: SnapRow) => (
    <li key={s.id} className={`ldx-li${s.archived ? ' aside' : ''}`} data-testid="ld-row" data-id={s.id}>
      <div className="ldx-row">
        <div className="ldx-name">
          <b>
            {label(s)}
            {s.launch ? <span className="ldx-tag st-launch">{g('tag.launch')}</span> : null}
            {s.auto ? <span className="ldx-tag st-auto">{g('tag.auto')}</span> : null}
            {s.archived ? <span className="ldx-tag st-aside">{g('tag.aside')}</span> : null}
          </b>
          <span className="lm-hint">{[s.by ?? g('someone'), when(s.at)].join(' · ')}</span>
          {chips(s)}
        </div>
        {p.canEdit ? (
          <div className="ldx-acts">
            {!s.archived && !s.launch ? (
              <button type="button" className="lm-btn sm" onClick={() => open({ kind: 'restore', snap: s })} disabled={busy} data-testid={`ld-restore-${s.id}`}>
                {g('restore')}
              </button>
            ) : null}
            {!s.auto ? (
              <button type="button" className="lm-btn sm gh" onClick={() => open({ kind: 'rename', snap: s })} disabled={busy}>
                {g('rename')}
              </button>
            ) : null}
            {!s.launch ? (
              <button type="button" className="lm-btn sm gh" onClick={() => void run({ action: s.archived ? 'unarchive' : 'archive', id: s.id }, () => g(s.archived ? 'done.back' : 'done.aside', { name: label(s) }))} disabled={busy} data-testid={`ld-aside-${s.id}`}>
                {s.archived ? g('unarchive') : g('archive')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {ask && (ask.kind === 'restore' || ask.kind === 'rename') && ask.snap.id === s.id ? confirmBox(ask) : null}
    </li>
  );

  const shown = v.looks.filter((s) => showAside || !s.archived);
  const asideCount = v.looks.filter((s) => s.archived).length;

  return (
    <div className="ldx" data-testid="ld-editor">
      {v.seasonLive ? (
        <p className="lm-hint ldx-warn" role="note" data-testid="ld-season">
          {g('seasonLive')}
        </p>
      ) : null}

      <section className="lm-card ldx-card" aria-labelledby={`${uid}-l`} data-testid="ld-launch">
        <h2 id={`${uid}-l`}>{g('launch.title')}</h2>
        <p className="lm-sub">{g('launch.sub')}</p>
        {v.launch ? <ul className="ldx-list">{snapRow({ ...v.launch })}</ul> : <p className="lm-hint" data-testid="ld-none">{g('launch.none')}</p>}
        {p.canEdit ? (
          <div className="ldx-bar">
            <button type="button" className="lm-btn pri" disabled={!v.launch || busy} onClick={() => v.launch && open({ kind: 'restore', snap: v.launch })} data-testid="ld-back">
              {g('launch.back')}
            </button>
            <button type="button" className="lm-btn" disabled={busy} onClick={() => open({ kind: 'save', launch: true })} data-testid="ld-save-launch">
              {g('launch.save')}
            </button>
          </div>
        ) : null}
        {ask?.kind === 'save' && ask.launch ? confirmBox(ask) : null}
      </section>

      <section className="lm-card ldx-card" aria-labelledby={`${uid}-s`} data-testid="ld-looks">
        <h2 id={`${uid}-s`}>{g('looks.title')}</h2>
        <p className="lm-sub">{g('looks.sub')}</p>
        {p.canEdit ? (
          <div className="ldx-bar">
            <button type="button" className="lm-btn" disabled={busy} onClick={() => open({ kind: 'save', launch: false })} data-testid="ld-save">
              {g('looks.save')}
            </button>
          </div>
        ) : null}
        {ask?.kind === 'save' && !ask.launch ? confirmBox(ask) : null}
        {shown.length ? <ul className="ldx-list">{shown.map(snapRow)}</ul> : <p className="lm-hint">{g('looks.none')}</p>}
        {asideCount ? (
          <button type="button" className="lm-btn sm gh ldx-more" aria-expanded={showAside} onClick={() => setShowAside(!showAside)} data-testid="ld-show-aside">
            {showAside ? g('looks.hideAside') : g('looks.showAside', { n: asideCount })}
          </button>
        ) : null}
      </section>

      <section className="lm-card ldx-card" aria-labelledby={`${uid}-g`} data-testid="ld-log">
        <h2 id={`${uid}-g`}>{g('log.title')}</h2>
        <p className="lm-sub">{g('log.sub')}</p>
        {v.log.length ? (
          <ul className="ldx-list">
            {v.log.map((r) => (
              <li key={r.id} className="ldx-li" data-testid="ld-log-row">
                <div className="ldx-row">
                  <div className="ldx-name">
                    <b>
                      {r.kind === 'undo' ? g('log.undo') : g(r.launch ? 'log.launch' : 'log.restore', { name: r.look })}
                      {r.undone ? <span className="ldx-tag st-aside">{g('log.undone')}</span> : null}
                    </b>
                    <span className="lm-hint">{[r.by ?? g('someone'), when(r.at), ...(r.paused ? [g('log.paused', { n: r.paused })] : [])].join(' · ')}</span>
                    {r.reason ? <span className="ldx-why">{r.reason}</span> : null}
                  </div>
                  {p.canEdit && r.canUndo ? (
                    <div className="ldx-acts">
                      <button type="button" className="lm-btn sm" disabled={busy} onClick={() => open({ kind: 'undo', id: r.id })} data-testid="ld-undo">
                        {g('undo')}
                      </button>
                    </div>
                  ) : null}
                </div>
                {ask?.kind === 'undo' && ask.id === r.id ? confirmBox(ask) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="lm-hint">{g('log.none')}</p>
        )}
      </section>

      <details className="lm-card ldx-card ldx-keys">
        <summary>{g('keys.title')}</summary>
        <p className="lm-sub">{g('keys.sub')}</p>
        <ul>
          {v.keys.map((k) => (
            <li key={k}>{g(`keys.k.${k.replace('.', '_')}`)}</li>
          ))}
          <li>{g('keys.ads')}</li>
        </ul>
        <p className="lm-hint">{g('keys.not')}</p>
      </details>
    </div>
  );
}
