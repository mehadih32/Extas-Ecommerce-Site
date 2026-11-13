'use client';
// S28 · PR 678 (CN-048, admin prototype v5, Rules › Pop-ups & notices) — every pop-up and notice the shop can show, in four groups
// (On the shop, At checkout, Product pages, After order). Each row says where it appears, who sees it, when, its state, and has the
// owner's own words, window and switch. A small picture shows where every number appears. A row driven by another rule ("Managed
// in …") follows that rule's switch; the owner's own notices (the bar and the welcome pop-up) are written below, on the same page.
// Nothing here opens by itself on the first page a visitor sees (the notices engine's own limits stay, PR 216).
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { POPUP_GROUPS, POPUPS, type PopupGroupId, type PopupPage } from '@extas/rules/pure';
import type { PopupView, PopupsScreen } from '@extas/rules';
import { call } from '../api';
import { Icon } from '../Icon';
import { say, sayBad } from '../products/useToast';
import { t, type Dict } from '@/lib/i18n';
import { rulesRefusal, type Lang } from './model';

export interface PopupsHubProps {
  dict: Dict;
  lang: Lang;
  screen: PopupsScreen;
  perms: { write: boolean };
  tabs?: ReactNode;
}

/** Where the mark of each placement sits on its page's small picture (percent from the left and the top). */
const POS: Record<string, [number, number]> = {
  notice: [50, 3],
  popup: [50, 50],
  holiday: [50, 19],
  freebar: [50, 90],
  dup: [50, 47],
  advance: [50, 72],
  stockhold: [86, 14],
  oos: [14, 30],
  demo: [50, 45],
  lowstock: [30, 68],
  thanks: [50, 32],
  promise: [50, 62],
};
const PAGES: PopupPage[] = ['home', 'product', 'checkout', 'thanks'];
const SAMPLE: Record<string, string> = {
  date: '25 Dec',
  amount: '৳300', // hardcode-ok: preview sample
  days: '5',
  order: 'EX-10231',
  minutes: '10',
  size: 'L',
  n: '3',
  name: 'Rahim',
};
const API = '/api/admin/rules/popups';

export function PopupsHub(props: PopupsHubProps) {
  const { dict: d, perms } = props;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `rulesHub.popups.${k}`, vars);
  const [screen, setScreen] = useState(props.screen);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const by = (g: PopupGroupId) => screen.popups.filter((p) => p.group === g);
  const count = (s: PopupView['state']) => screen.popups.filter((p) => p.state === s).length;
  const selPopup = screen.popups.find((p) => p.key === sel) ?? null;
  const nameOf = (k: string) => tt(`items.${k}.name`);

  const save = async (p: PopupView, entry: PopupView['entry'], done: string) => {
    setBusy(true);
    const a = await call('PUT', `${API}/${p.key}`, { entry, version: screen.version });
    setBusy(false);
    if (a.status !== 200 || !a.data.popups) return sayBad(rulesRefusal(d, a.data.error, a.data.details ?? []));
    setScreen(a.data.popups as PopupsScreen);
    say(tt(done));
  };

  const windowText = (p: PopupView) => (p.entry.from || p.entry.to ? `${p.entry.from ?? tt('now')} – ${p.entry.to ?? tt('noEnd')}` : tt('always'));

  return (
    <div className="rh">
      <div className="ad-hd rl-hd">
        <div className="rl-hd-text">
          <h1 className="ad-h1">{tt('title')}</h1>
          <p className="ad-intro">{tt('intro')}</p>
        </div>
      </div>
      {props.tabs}
      <div className="rh-strip" role="status">
        <span className="rh-sp good">{tt('showing', { n: count('on') })}</span>
        <span className="rh-sp">{tt('scheduled', { n: count('scheduled') })}</span>
        <span className="rh-sp">{tt('off', { n: count('off') })}</span>
        <a className="rh-sp link" href="#rh-own">
          {tt('ownNotices')}
        </a>
      </div>
      <div className="po-frames" aria-label={tt('picture')}>
        {PAGES.map((pg) => (
          <figure key={pg} className="po-fw">
            <div className={`po-fr pg-${pg}`}>
              <i className="hd" />
              {screen.popups
                .filter((p) => p.page === pg)
                .map((p) => (
                  <button
                    type="button"
                    key={p.key}
                    className={`po-mk ${sel === p.key ? 'on' : ''}`}
                    style={{ left: `${POS[p.key]?.[0] ?? 50}%`, top: `${POS[p.key]?.[1] ?? 50}%` }}
                    onClick={() => setSel(p.key)}
                    aria-label={`${p.n}. ${nameOf(p.key)}`}
                    title={nameOf(p.key)}
                  >
                    {p.n}
                  </button>
                ))}
            </div>
            <figcaption>{tt(`pages.${pg}`)}</figcaption>
          </figure>
        ))}
      </div>
      <div className={`rh-l po-l ${selPopup ? 'has-ed' : ''}`}>
        <div className="rh-main">
          {POPUP_GROUPS.map((g) => {
            const items = by(g);
            return (
              <section key={g} className="rh-grp" aria-labelledby={`po-g-${g}`}>
                <h2 id={`po-g-${g}`}>
                  {tt(`groups.${g}`)} <small>{tt('groupCount', { on: items.filter((p) => p.state === 'on').length, n: items.length })}</small>
                </h2>
                {items.map((p) => {
                  const own = !p.notice && p.state !== 'waiting';
                  return (
                    <div key={p.key} className={`po-row ${sel === p.key ? 'sel' : ''}`}>
                      <button type="button" className="po-main" onClick={() => setSel(sel === p.key ? null : p.key)} aria-expanded={sel === p.key}>
                        <span className="po-n">{p.n}</span>
                        <span className={`po-th pg-${p.page}`} aria-hidden="true">
                          <i className="hd" />
                          <i className={`hl k-${p.shape}`} />
                        </span>
                        <span className="po-t">
                          <b>{nameOf(p.key)}</b>
                          <span className="po-meta">
                            <em>{tt('where')}:</em> {tt(`items.${p.key}.where`)}
                          </span>
                          <span className="po-meta">
                            <em>{tt('who')}:</em> {tt(`items.${p.key}.who`)}
                          </span>
                          <span className="po-chips">
                            <span className="po-chip">{windowText(p)}</span>
                            {p.managed ? (
                              <span className="po-chip">
                                {tt('managedIn')} {tt(`items.${p.key}.managed`)}
                              </span>
                            ) : null}
                            {p.notice ? <span className="po-chip">{tt('writtenBelow')}</span> : null}
                            {p.needs && !p.needs.on ? (
                              <span className="po-chip warn">
                                {tt('needs')} {tt(`items.${p.key}.needs`)}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                      <div className="po-st">
                        <span className={`rh-pl ${p.state}`}>{tt(`state.${p.state}`)}</span>
                        {own ? (
                          <label className="rh-sw">
                            <input
                              type="checkbox"
                              checked={p.entry.on}
                              disabled={busy || !perms.write || !!p.managed}
                              onChange={(e) => void save(p, { ...p.entry, on: e.target.checked }, e.target.checked ? 'switchedOn' : 'switchedOff')}
                              aria-label={`${nameOf(p.key)}: ${tt('showThis')}`}
                            />
                          </label>
                        ) : null}
                      </div>
                      {sel === p.key ? <div className="rh-inline">{editor(p)}</div> : null}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
        <aside className="rh-side">{selPopup ? editor(selPopup) : <p className="rh-hint">{tt('pickOne')}</p>}</aside>
      </div>
    </div>
  );

  function editor(p: PopupView): ReactNode {
    return (
      <PopupEditor
        key={`${p.key}-${screen.version}`}
        p={p}
        tt={tt}
        name={nameOf(p.key)}
        canWrite={perms.write}
        busy={busy}
        onSave={(entry) => void save(p, entry, 'saved')}
        onClose={() => setSel(null)}
      />
    );
  }
}

function fill(text: string, extra?: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => extra?.[k] ?? SAMPLE[k] ?? m);
}

function PopupEditor({
  p,
  tt,
  name,
  canWrite,
  busy,
  onSave,
  onClose,
}: {
  p: PopupView;
  tt: (k: string, v?: Record<string, string | number>) => string;
  name: string;
  canWrite: boolean;
  busy: boolean;
  onSave: (e: PopupView['entry']) => void;
  onClose: () => void;
}) {
  const [e, setE] = useState(p.entry);
  const spec = POPUPS.find((x) => x.key === p.key)!;
  const locked = p.notice !== null || p.state === 'waiting';
  const dirty = JSON.stringify(e) !== JSON.stringify(p.entry);
  const put = (patch: Partial<typeof e>) => setE((x) => ({ ...x, ...patch }));
  const insert = (token: string) => put({ textEn: `${e.textEn}{${token}}` });
  const shown = fill(e.textEn || tt(`items.${p.key}.builtin`), e.n ? { n: String(e.n) } : undefined);
  return (
    <section className="rh-card">
      <div className="rh-cardhd">
        <h3>
          {p.n}. {name}
        </h3>
        <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onClose} aria-label={tt('close')}>
          <Icon name="close" size={14} />
        </button>
      </div>
      {p.notice ? <div className="ad-note">{tt('noticeNote')}</div> : null}
      {p.state === 'waiting' ? <div className="ad-note">{tt('waitingNote')}</div> : null}
      {p.managed ? (
        <div className="ad-note">
          {tt('managedNote', { rule: tt(`items.${p.key}.managed`) })}{' '}
          <Link className="rl-link" href={p.managed.href}>
            {tt('openIt')} →
          </Link>
        </div>
      ) : null}
      {p.needs && !p.needs.on ? (
        <div className="ad-note warn">
          {tt('needsNote', { rule: tt(`items.${p.key}.needs`) })}{' '}
          <Link className="rl-link" href={p.needs.href}>
            {tt('openIt')} →
          </Link>
        </div>
      ) : null}
      {locked ? null : (
        <>
          {!p.managed ? (
            <label className="rh-sw">
              <input type="checkbox" checked={e.on} onChange={(x) => put({ on: x.target.checked })} disabled={!canWrite} /> <span>{tt('showThis')}</span>
            </label>
          ) : null}
          {spec.tokens.length ? (
            <div>
              <div className="ad-label">{tt('putDetail')}</div>
              <div className="rh-chips">
                {spec.tokens.map((k) => (
                  <button type="button" key={k} className="ad-chip" onClick={() => insert(k)} disabled={!canWrite}>{`{${k}}`}</button>
                ))}
              </div>
            </div>
          ) : null}
          <div>
            <label className="ad-label" htmlFor={`po-en-${p.key}`}>
              {tt('textEn')}
            </label>
            <textarea
              id={`po-en-${p.key}`}
              className="ad-input rl-area"
              rows={2}
              maxLength={200}
              value={e.textEn}
              onChange={(x) => put({ textEn: x.target.value })}
              disabled={!canWrite}
              placeholder={tt('builtinHint')}
            />
          </div>
          <div>
            <label className="ad-label" htmlFor={`po-bn-${p.key}`}>
              {tt('textBn')}
            </label>
            <textarea id={`po-bn-${p.key}`} className="ad-input rl-area" rows={2} maxLength={200} value={e.textBn} onChange={(x) => put({ textBn: x.target.value })} disabled={!canWrite} />
          </div>
          <div className="rh-fields two">
            <div>
              <label className="ad-label" htmlFor={`po-from-${p.key}`}>
                {tt('from')}
              </label>
              <input id={`po-from-${p.key}`} className="ad-input" type="date" value={e.from ?? ''} onChange={(x) => put({ from: x.target.value || null })} disabled={!canWrite} />
            </div>
            <div>
              <label className="ad-label" htmlFor={`po-to-${p.key}`}>
                {tt('until')}
              </label>
              <input id={`po-to-${p.key}`} className="ad-input" type="date" value={e.to ?? ''} onChange={(x) => put({ to: x.target.value || null })} disabled={!canWrite} />
            </div>
            {spec.hasN ? (
              <div>
                <label className="ad-label" htmlFor={`po-n-${p.key}`}>
                  {tt('lowN')}
                </label>
                <input
                  id={`po-n-${p.key}`}
                  className="ad-input"
                  inputMode="numeric"
                  value={e.n ?? ''}
                  onChange={(x) => {
                    const v = x.target.value.trim();
                    put({ n: v === '' ? null : Number.isFinite(Number(v)) ? Math.max(1, Math.min(50, Math.trunc(Number(v)))) : e.n });
                  }}
                  disabled={!canWrite}
                />
              </div>
            ) : null}
          </div>
          <div className="rh-prev">
            <div className="rh-sub">{tt('preview')}</div>
            <div className={`rh-pv k-${p.shape}`}>{shown}</div>
            <p className="rh-hint">{tt('sampleHint')}</p>
          </div>
          <div className="rl-actions">
            <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" onClick={() => onSave(e)} disabled={busy || !canWrite || !dirty}>
              <Icon name="check" size={15} /> {tt('save')}
            </button>
            <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onClose}>
              {tt('cancel')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
