'use client';
// S28 · PR 678 (CN-048, admin prototype v5, Rules › Pop-ups & notices) — every pop-up and notice the shop can show, in four groups
// (On the shop, At checkout, Product pages, After order). Each row says where it appears, who sees it, when, its state, and has the
// owner's own words, window and switch. A small picture shows where every number appears. A row driven by another rule ("Managed
// in …") follows that rule's switch; the owner's own notices (the bar and the welcome pop-up) are written below, on the same page.
// Nothing here opens by itself on the first page a visitor sees (the notices engine's own limits stay, PR 216).
import Link from 'next/link';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { POPUP_GROUPS, POPUPS, type PopupGroupId, type PopupPage } from '@extas/rules/pure';
import type { PopupView, PopupsScreen } from '@extas/rules';
import { call } from '../api';
import { PageHead } from '../shell/ShellHead';
import { locateKey } from '@/lib/admin-shell/sections';
import { Icon, type IconName } from '../Icon';
import { useNarrow } from './useNarrow';
import { say, sayBad } from '../products/useToast';
import { t, type Dict } from '@/lib/i18n';
import { rulesRefusal, type Lang } from './model';

export interface PopupsHubProps {
  dict: Dict;
  /** PR 942: the other language's words, for the "Customer sees" lines in English and Bengali. */
  otherDict: Dict;
  lang: Lang;
  screen: PopupsScreen;
  perms: { write: boolean };
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
const POS_ALT: Record<string, { page: PopupPage; at: [number, number] }[]> = { promise: [{ page: 'product', at: [50, 85] }] };
const PAGES: PopupPage[] = ['home', 'product', 'checkout', 'thanks'];

/** The small sketch of a page (the prototype's thumbnail): a header and a few blocks. */
function Sketch({ page }: { page: PopupPage }) {
  if (page === 'home')
    return (
      <>
        <i className="hero" />
        <i className="ln" />
        <i className="ln s" />
      </>
    );
  if (page === 'product')
    return (
      <>
        <i className="im" />
        <i className="ln" />
        <i className="ln s" />
        <i className="bt" />
      </>
    );
  if (page === 'checkout')
    return (
      <>
        <i className="ln a" />
        <i className="ln b" />
        <i className="ln s" />
        <i className="bt" />
      </>
    );
  return (
    <>
      <i className="ck" />
      <i className="ln" />
      <i className="ln s" />
    </>
  );
}
const shortDay = (iso: string, lang: Lang) => new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'bn' ? 'bn-BD-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' });
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
const GROUP_ICON: Record<PopupGroupId, IconName> = { shop: 'layers', checkout: 'check', product: 'box', after: 'notice' };

export function PopupsHub(props: PopupsHubProps) {
  const { dict: d, perms, lang } = props;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `rulesHub.popups.${k}`, vars);
  const [screen, setScreen] = useState(props.screen);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const narrow = useNarrow();
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

  const undo = async (p: PopupView, changeId: string) => {
    if (!window.confirm(tt('history.confirm'))) return;
    setBusy(true);
    const a = await call('POST', `${API}/${p.key}/undo`, { version: screen.version, changeId });
    setBusy(false);
    if (a.status !== 200 || !a.data.popups) return sayBad(rulesRefusal(d, a.data.error, a.data.details ?? []));
    setScreen(a.data.popups as PopupsScreen);
    say(tt('history.done'));
  };

  const windowText = (p: PopupView) => (p.entry.from || p.entry.to ? `${p.entry.from ? shortDay(p.entry.from, lang) : tt('now')} – ${p.entry.to ? shortDay(p.entry.to, lang) : tt('noEnd')}` : tt('always'));
  const open = (k: string | null) => setSel(k);
  const stateText = (p: PopupView) => (p.state === 'scheduled' && p.entry.from ? tt('state.from', { date: shortDay(p.entry.from, lang) }) : tt(`state.${p.state}`));

  return (
    <div className="rh">
      <PageHead view={{ dict: props.dict }} place={locateKey('notices')} title={tt('title')} sub={tt('intro')} />
      <div className="rh-strip" role="status">
        <span className="rh-sp good">{tt('showing', { n: count('on') })}</span>
        {count('scheduled') ? <span className="rh-sp info">{tt('scheduled', { n: count('scheduled') })}</span> : null}
        <span className="rh-sp off">{tt('off', { n: count('off') })}</span>
      </div>
      <section className="rh-card po-pic" aria-labelledby="po-pic-h">
        <h3 id="po-pic-h">{tt('picture')}</h3>
        <p className="rh-hint">{tt('pictureSub')}</p>
        <div className="po-frames">
          {PAGES.map((pg) => (
            <figure key={pg} className="po-fw">
              <div className={`po-fr pg-${pg}`}>
                <i className="hd" />
                <Sketch page={pg} />
                {[
                  ...screen.popups.filter((x) => x.page === pg).map((x) => ({ x, at: POS[x.key] ?? ([50, 50] as [number, number]) })),
                  ...screen.popups.flatMap((x) => (POS_ALT[x.key] ?? []).filter((a) => a.page === pg).map((a) => ({ x, at: a.at }))),
                ].map(({ x, at }) => (
                  <button
                    type="button"
                    key={`${x.key}-${pg}`}
                    className={`po-mk ${sel === x.key ? 'on' : ''}`}
                    style={{ left: `${at[0]}%`, top: `${at[1]}%` }}
                    onClick={() => open(x.key)}
                    aria-label={`${x.n}. ${nameOf(x.key)}`}
                    title={nameOf(x.key)}
                  >
                    <span>{x.n}</span>
                  </button>
                ))}
              </div>
              <figcaption>{tt(`pages.${pg}`)}</figcaption>
            </figure>
          ))}
        </div>
      </section>
      <div className={`rh-l po-l ${selPopup ? 'has-ed' : ''}`}>
        <div className="rh-main">
          {POPUP_GROUPS.map((g) => {
            const items = by(g);
            return (
              <section key={g} className="rh-grp" aria-labelledby={`po-g-${g}`}>
                <h2 id={`po-g-${g}`}>
                  <Icon name={GROUP_ICON[g]} size={15} /> {tt(`groups.${g}`)} <small>{tt('groupCount', { on: items.filter((p) => p.state === 'on').length, n: items.length })}</small>
                </h2>
                {items.map((p) => {
                  const own = !p.notice && !p.readOnly && p.state !== 'waiting';
                  // PR 1200 (prototype v5): the whole row is the button (number, picture, where, who, status); the switch and the links stop the click
                  const toggle = () => open(sel === p.key ? null : p.key);
                  return (
                    <Fragment key={p.key}>
                    <div
                      className={`po-row ${sel === p.key ? 'sel' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={toggle}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                          e.preventDefault();
                          toggle();
                        }
                      }}
                      aria-expanded={sel === p.key}
                    >
                      <div className="po-main">
                        <span className="po-n">{p.n}</span>
                        <span className={`po-th pg-${p.page}`} aria-hidden="true">
                          <i className="hd" />
                          <Sketch page={p.page} />
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
                            <span className="po-chip">
                              <Icon name="check" size={12} /> {windowText(p)}
                            </span>
                            {p.managed ? (
                              <Link className="po-chip link" href={p.managed.href} onClick={(e) => e.stopPropagation()}>
                                {tt('managedIn')} {tt(`items.${p.key}.managed`)} →
                              </Link>
                            ) : null}
                            {p.notice ? <span className="po-chip">{tt('writtenBelow')}</span> : null}
                            {p.needs && !p.needs.on ? (
                              <Link className="po-chip warn" href={p.needs.href} onClick={(e) => e.stopPropagation()}>
                                {tt('needs')} {tt(`items.${p.key}.needs`)} →
                              </Link>
                            ) : null}
                          </span>
                        </span>
                      </div>
                      <div className="po-st">
                        <span className={`rh-pl ${p.state}`}>{stateText(p)}</span>
                        {own ? (
                          <label className="rh-sw is-switch" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={p.entry.on}
                              disabled={busy || !perms.write || !!p.managed?.engine}
                              onChange={(e) => void save(p, { ...p.entry, on: e.target.checked }, e.target.checked ? 'switchedOn' : 'switchedOff')}
                              aria-label={`${nameOf(p.key)}: ${tt('showThis')}`}
                            />
                          </label>
                        ) : (
                          <span className="rh-go">{tt('see')}</span>
                        )}
                      </div>
                    </div>
                    {sel === p.key && narrow ? <div className="rh-inline">{editor(p)}</div> : null}
                    </Fragment>
                  );
                })}
              </section>
            );
          })}
        </div>
        <aside className="rh-side">
          {selPopup && !narrow ? (
            editor(selPopup)
          ) : selPopup ? null : (
            <section className="rh-card">
              <h3>{tt('pickTitle')}</h3>
              <p className="rh-hint">{tt('pickOne')}</p>
              <div className="ad-note info">{tt('pickNote')}</div>
            </section>
          )}
        </aside>
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
        lang={lang}
        dictEn={lang === 'en' ? d : props.otherDict}
        dictBn={lang === 'bn' ? d : props.otherDict}
        canWrite={perms.write}
        busy={busy}
        onSave={(entry) => void save(p, entry, 'saved')}
        version={screen.version}
        onUndo={(changeId) => void undo(p, changeId)}
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
  lang,
  dictEn,
  dictBn,
  canWrite,
  busy,
  onSave,
  onUndo,
  version,
  onClose,
}: {
  p: PopupView;
  tt: (k: string, v?: Record<string, string | number>) => string;
  name: string;
  lang: Lang;
  dictEn: Dict;
  dictBn: Dict;
  canWrite: boolean;
  busy: boolean;
  onSave: (e: PopupView['entry']) => void;
  onUndo: (changeId: string) => void;
  version: string;
  onClose: () => void;
}) {
  const [e, setE] = useState(p.entry);
  // PR 949: "More options" › "History": what the last changes replaced, and "Undo to this" (a new change; nothing is deleted)
  const [hist, setHist] = useState<{ changeId: string; entry: PopupView['entry'] | null; at: string; by: string | null }[] | null>(null);
  useEffect(() => {
    void call('GET', `${API}/${p.key}/history`).then((a) => {
      if (a.status === 200 && Array.isArray(a.data.history)) setHist(a.data.history as NonNullable<typeof hist>);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.key, version]);
  const spec = POPUPS.find((x) => x.key === p.key)!;
  const locked = p.notice !== null || p.readOnly || p.state === 'waiting';
  const dirty = JSON.stringify(e) !== JSON.stringify(p.entry);
  const put = (patch: Partial<typeof e>) => setE((x) => ({ ...x, ...patch }));
  const insert = (token: string) => put({ textEn: `${e.textEn}{${token}}` });
  const extra = e.n ? { n: String(e.n) } : undefined;
  const shownEn = fill(e.textEn || t(dictEn, `rulesHub.popups.items.${p.key}.builtin`), extra);
  const shownBn = fill(e.textBn || t(dictBn, `rulesHub.popups.items.${p.key}.builtin`), extra);
  const shown = lang === 'bn' ? shownBn : shownEn;
  return (
    <section className="rh-card">
      <div className="rh-cardhd">
        <h3>{name}</h3>
        <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onClose} aria-label={tt('close')}>
          <Icon name="close" size={14} />
        </button>
      </div>
      {p.notice ? <div className="ad-note">{tt('noticeNote')}</div> : null}
      {p.state === 'waiting' ? <div className="ad-note">{tt('waitingNote')}</div> : null}
      {p.managed ? (
        <div className="ad-note info">
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
          {!p.managed?.engine ? (
            <label className="rh-sw is-switch">
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
              <div className="rh-hint">{tt('fromHint')}</div>
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
          <div className="rh-sees rh-prev">
            <div className="rh-sub">{tt('preview')}</div>
            <div className={`rh-pv k-${p.shape}`}>{shown}</div>
            <div className="po-both">
              <div>
                <span className="rh-hint">{tt("langEn")}</span> {shownEn}
              </div>
              <div lang="bn">
                <span className="rh-hint">{tt("langBn")}</span> {shownBn}
              </div>
            </div>
            <p className="rh-hint">{tt('sampleHint')}</p>
          </div>
          <details className="rh-more" data-testid="po-more">
            <summary>{tt('more.title')}</summary>
            <div className="rh-hist" data-testid="po-history">
              <div className="rh-sub">{tt('history.title')}</div>
              {hist && hist.length ? (
                <div className="rh-histlist">
                  {hist.map((h) => (
                    <div key={h.changeId} data-testid="po-hist-row">
                      <span>
                        <b>{h.entry ? (h.entry.on ? tt('history.on') : tt('history.off')) : tt('history.builtin')}</b>
                        {h.entry && (h.entry.textEn || h.entry.textBn) ? <> · {lang === 'bn' && h.entry.textBn ? h.entry.textBn : h.entry.textEn}</> : null}
                        <br />
                        <span className="rh-hint">
                          {tt('history.until')} {new Date(h.at).toLocaleString(lang === 'bn' ? 'bn-BD-u-nu-latn' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          {h.by ? ` · ${h.by}` : ''}
                        </span>
                      </span>
                      <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => onUndo(h.changeId)} disabled={busy || !canWrite} data-testid="po-undo">
                        <Icon name="sync" size={14} /> {tt('history.undo')}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rh-hint">{hist === null ? '' : tt('history.none')}</p>
              )}
            </div>
          </details>
          <div className="rl-actions rh-btns">
            <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onClose}>
              {tt('cancel')}
            </button>
            <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" onClick={() => onSave(e)} disabled={busy || !canWrite || !dirty}>
              <Icon name="check" size={15} /> {tt('save')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
