'use client';
// S02 · PR 600 (register "On-page edit mode"; Blueprint D10.6) — the owner's bar and side panel on a shop page. Only
// loaded by components/shop/PageEditBar for the signed-in owner. Words: messages/page-edit.<lang>.json.
// - Edit mode (on/off, kept in the `extas_pe` cookie so every page of the visit shows it): with a real mouse, a section
//   under the pointer gets an outline and an Edit button; Sections lists the page's sections (shown or hidden), so a
//   hidden one can be shown again and phones and keyboards reach every section.
// - The side panel shows that section's own settings (POST /api/admin/website/page-edit, section); every change goes
//   into the owner's draft (set) and the page redraws with it, only for him. Prices, offers and money are links to their
//   own admin page, never fields. The bag and the checkout are locked.
// - On a phone (the shop's phone layout) the light version: texts only, plus the money links; no moving.
// - Publish. On a computer, when "Apply to phone too?" is on: Yes runs the phone checks on every phone size in hidden
//   frames (components/shop/page-edit-measure), shows each result (open any size to look), and publishes only when every
//   size passed and the owner ticked OK; No publishes what can be kept to computers. The real-phone check (device farm)
//   is named as not available. Undo the last publish; throw the draft away (kept in the history).
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { EditView, FieldView, PageSections, PublishDone, SectionView } from '@/lib/website/page-edit-admin';
import type { EditPage } from '@/lib/website/page-edit-model';
import { judgePhone, type PhoneIssue, type PhoneMeasure } from '@/lib/website/page-edit-phone';
import bnWords from '../../../messages/page-edit.bn.json';
import enWords from '../../../messages/page-edit.en.json';
import { measureAt } from './page-edit-measure';
import './page-edit.css';

const API = '/api/admin/website/page-edit';
const COOKIE = 'extas_pe';
/** Sections changed in this tab (their tap sizes are checked on phones). */
const SECS = 'extas_pe_secs';
/** The shop's phone layout (shop-app.css: below the computer width). */
const PHONE_MQ = '(max-width: 1023.98px)';
const DEVS = ['both', 'phone', 'desktop'] as const;

type Dict = { [k: string]: string | Dict };
type Answer = { ok?: boolean; error?: string; details?: string[]; view?: EditView; section?: SectionView; sections?: PageSections; done?: PublishDone };
type Open = null | { kind: 'page' } | { kind: 'section'; id: string };
type Dlg = null | 'ask' | 'checking' | 'checked' | 'phone';
type Result = PhoneMeasure & { pass: boolean; issues: PhoneIssue[] };
interface Hover {
  id: string;
  el: Element;
  rect: { top: number; left: number; width: number; height: number };
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

async function call(method: 'GET' | 'POST', payload?: unknown): Promise<{ status: number; a: Answer }> {
  try {
    const res = await fetch(API, { method, credentials: 'same-origin', cache: 'no-store', headers: payload ? { 'content-type': 'application/json' } : undefined, body: payload ? JSON.stringify(payload) : undefined });
    return { status: res.status, a: (await res.json().catch(() => ({}))) as Answer };
  } catch {
    return { status: 0, a: { error: 'network' } };
  }
}

/** The box a section draws (its wrapper takes no box of its own). */
function boxOf(el: Element): Hover['rect'] | null {
  const kids = [...el.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  if (!kids.length) return null;
  const top = Math.min(...kids.map((r) => r.top));
  const left = Math.min(...kids.map((r) => r.left));
  const bottom = Math.max(...kids.map((r) => r.bottom));
  const right = Math.max(...kids.map((r) => r.right));
  return { top, left, width: right - left, height: bottom - top };
}

function readSecs(): string[] {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(SECS) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function writeSecs(v: string[]) {
  try {
    window.sessionStorage.setItem(SECS, JSON.stringify(v));
  } catch {
    /* a tab without storage checks the whole page's sizes only */
  }
}

export function PageEditPanel(p: { edit: boolean; page: EditPage; lang: 'en' | 'bn' }) {
  const router = useRouter();
  const uid = useId();
  const w = (p.lang === 'bn' ? bnWords : enWords).pge as unknown as Dict;
  const g = useCallback(
    (k: string, vars: Record<string, string | number> = {}): string => {
      const v = k.split('.').reduce<string | Dict | undefined>((o, part) => (o && typeof o === 'object' ? o[part] : undefined), w);
      return typeof v === 'string' ? fill(v, vars) : k;
    },
    [w],
  );
  const panel = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<EditView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [small, setSmall] = useState(false);
  const [light, setLight] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  const [section, setSection] = useState<SectionView | null>(null);
  const [list, setList] = useState<PageSections | null>(null);
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [hover, setHover] = useState<Hover | null>(null);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [okTick, setOkTick] = useState(false);
  const [preview, setPreview] = useState<{ name: string; w: number; h: number } | null>(null);
  const locked = p.page === 'bag' || p.page === 'checkout';
  /** The bar's height: the page gets the same room at its foot, so the bar never hides the footer's last links. */
  const [room, setRoom] = useState(0);
  useEffect(() => {
    const el = panel.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setRoom(Math.ceil(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fail = useCallback((a: Answer, status: number) => {
    const code = a.error ?? (status === 401 ? 'UNAUTHENTICATED' : 'other');
    const text = g(`err.${code}`);
    setMsg(text === `err.${code}` ? g('err.other') : text);
  }, [g]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await call('GET');
      if (!live) return;
      if (r.a.ok && r.a.view) setView(r.a.view);
      else setErr(r.a.error ?? 'other');
    })();
    const mq = window.matchMedia(PHONE_MQ);
    const set = () => setLight(mq.matches);
    const id = window.setTimeout(set, 0);
    mq.addEventListener('change', set);
    return () => {
      live = false;
      window.clearTimeout(id);
      mq.removeEventListener('change', set);
    };
  }, []);
  const lightMode = light && (view?.cfg.phoneLight ?? true);

  // The outline with a real mouse only (a tap fires no leave; the lessons file, R15).
  useEffect(() => {
    if (!p.edit || lightMode || locked) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const t = e.target as Element | null;
      if (!t || panel.current?.contains(t) || t.closest('[data-pge-keep]')) return;
      const el = t.closest('[data-pe]');
      if (!el) return setHover(null);
      const id = el.getAttribute('data-pe') ?? '';
      setHover((h) => {
        if (h && h.el === el) return h;
        const rect = boxOf(el);
        return rect ? { id, el, rect } : null;
      });
    };
    const re = () => setHover((h) => (h ? { ...h, rect: boxOf(h.el) ?? h.rect } : h));
    document.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('scroll', re, { passive: true });
    window.addEventListener('resize', re);
    return () => {
      document.removeEventListener('pointermove', move);
      window.removeEventListener('scroll', re);
      window.removeEventListener('resize', re);
    };
  }, [p.edit, lightMode, locked]);

  const setEdit = (on: boolean) => {
    document.cookie = on ? `${COOKIE}=1; path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}` : `${COOKIE}=; path=/; max-age=0; SameSite=Strict`;
    setHover(null);
    setOpen(null);
    router.refresh();
  };

  const openPage = async () => {
    setBusy(true);
    const r = await call('POST', { action: 'page', page: p.page });
    setBusy(false);
    if (!r.a.ok) return fail(r.a, r.status);
    if (r.a.view) setView(r.a.view);
    setList(r.a.sections ?? null);
    setSection(null);
    setOpen({ kind: 'page' });
  };

  const openSection = async (id: string) => {
    setBusy(true);
    const r = await call('POST', { action: 'section', page: p.page, id });
    setBusy(false);
    if (!r.a.ok) return fail(r.a, r.status);
    if (r.a.view) setView(r.a.view);
    setSection(r.a.section ?? null);
    setInputs({});
    setOpen({ kind: 'section', id });
    setHover(null);
    if (!list) {
      const l = await call('POST', { action: 'page', page: p.page });
      if (l.a.ok) setList(l.a.sections ?? null);
    }
  };

  const setField = async (f: FieldView, value: unknown) => {
    if (!section) return;
    setBusy(true);
    setMsg(g('saving'));
    const r = await call('POST', { action: 'set', page: p.page, id: section.id, field: f.id, value });
    setBusy(false);
    if (!r.a.ok) return fail(r.a, r.status);
    if (r.a.view) setView(r.a.view);
    if (r.a.section) setSection(r.a.section);
    setInputs((i) => {
      const n = { ...i };
      delete n[f.id];
      return n;
    });
    writeSecs([...new Set([...readSecs(), section.id])]);
    setMsg(g('done.saved'));
    router.refresh();
  };

  const finish = (r: { status: number; a: Answer }, ok: string) => {
    if (!r.a.ok) return fail(r.a, r.status);
    if (r.a.view) setView(r.a.view);
    setDlg(null);
    setResults([]);
    setOkTick(false);
    setMsg(ok);
    if (!r.a.view?.draft.length) writeSecs([]);
    setSection(null);
    setOpen(null);
    router.refresh();
  };

  const publish = async (extra: Record<string, unknown>) => {
    setBusy(true);
    const r = await call('POST', { action: 'publish', path: location.pathname, ...extra });
    setBusy(false);
    const held = r.a.done?.held.length ?? 0;
    finish(r, held ? g('done.held', { n: held }) : g('done.published'));
  };

  const startPublish = () => {
    if (!view) return;
    if (light) setDlg('phone');
    else if (view.cfg.askPhone) setDlg('ask');
    else void publish({});
  };

  const runChecks = async () => {
    if (!view) return;
    setDlg('checking');
    setResults([]);
    setOkTick(false);
    const out: Result[] = [];
    for (const size of view.cfg.phones) {
      const m = await measureAt(location.href, size, { sections: readSecs(), tapMinPx: view.cfg.tapMinPx, inlineLinkMinPx: view.cfg.inlineLinkMinPx, waitMs: view.cfg.waitMs });
      out.push({ ...m, ...judgePhone(m, view.cfg) });
      setResults([...out]);
    }
    setDlg('checked');
  };

  const undo = async () => {
    if (!view?.last) return;
    setBusy(true);
    const r = await call('POST', { action: 'undo', restoreId: view.last.restoreId });
    setBusy(false);
    finish(r, g('done.undone'));
  };

  const discard = async () => {
    setBusy(true);
    const r = await call('POST', { action: 'discard' });
    setBusy(false);
    finish(r, g('done.discarded'));
  };

  const words = () => {
    if (!view?.frontEdit) return;
    try {
      window.sessionStorage.setItem('extas_words_edit', '1');
    } catch {
      /* no storage: the words panel cannot open from here */
    }
    location.reload();
  };

  const nameOf = useCallback(
    (id: string) => {
      if (id.startsWith('lb-')) {
        const n = list?.sections.find((s) => s.id === id)?.name;
        return n ? g('sec.own', { name: n }) : g('sec.ownNoName');
      }
      const k = `sec.${p.page}.${id}`;
      const t = g(k);
      return t === k ? id : t;
    },
    [g, list, p.page],
  );

  const draftN = view?.draft.length ?? 0;
  /** The preview of one phone size, scaled down to fit the screen (never up). */
  const scale = preview ? Math.min(1, (window.innerHeight - 140) / preview.h, (window.innerWidth - 40) / preview.w) : 1;
  const allPass = results.length > 0 && results.every((r) => r.pass);
  const fields = useMemo(() => (section ? (lightMode ? section.fields.filter((f) => f.kind === 'label' || f.kind === 'words') : section.fields) : []), [section, lightMode]);

  if (err === 'OWNER_ONLY' || err === 'PAGE_EDIT_OFF') return null;

  const fieldRow = (f: FieldView) => {
    const name = g(`f.${f.name}`);
    const fid = `${uid}-${f.id}`;
    const tag = f.changed ? <span className="pge-chg">{g('changed')}</span> : null;
    if (f.kind === 'show' || f.kind === 'toggle') {
      const on = f.value === true;
      return (
        <div className="pge-row" key={f.id}>
          <span id={fid} className="pge-lbl">
            {name} {tag}
          </span>
          <button type="button" role="switch" aria-checked={on} aria-labelledby={fid} className={`pge-sw${on ? ' on' : ''}`} disabled={busy} onClick={() => void setField(f, !on)} data-testid={`pge-f-${f.name}`}>
            <span aria-hidden="true" />
          </button>
        </div>
      );
    }
    if (f.kind === 'dev')
      return (
        <div className="pge-fld" key={f.id}>
          <label htmlFor={fid}>
            {name} {tag}
          </label>
          <select id={fid} value={String(f.value ?? 'both')} disabled={busy} onChange={(e) => void setField(f, e.target.value)} data-testid="pge-f-dev">
            {DEVS.map((d) => (
              <option key={d} value={d}>
                {g(`dev.${d}`)}
              </option>
            ))}
          </select>
        </div>
      );
    if (f.kind === 'move') {
      const at = (f.value as { at: number; of: number } | null) ?? { at: 0, of: 1 };
      return (
        <div className="pge-row" key={f.id}>
          <span className="pge-lbl">
            {name} {tag}
          </span>
          <span className="pge-acts">
            <button type="button" className="pge-btn" disabled={busy || at.at <= 0} onClick={() => void setField(f, 'up')} data-testid="pge-up">
              ↑ {g('up')}
            </button>
            <button type="button" className="pge-btn" disabled={busy || at.at >= at.of - 1} onClick={() => void setField(f, 'down')} data-testid="pge-down">
              ↓ {g('down')}
            </button>
          </span>
        </div>
      );
    }
    if (f.kind === 'number') {
      const v = (inputs[f.id] as string | undefined) ?? String(f.value ?? '');
      return (
        <div className="pge-fld" key={f.id}>
          <label htmlFor={fid}>
            {name} {tag}
          </label>
          <span className="pge-acts">
            <input id={fid} type="number" inputMode="numeric" min={f.min} max={f.max} step={1} value={v} onChange={(e) => setInputs((i) => ({ ...i, [f.id]: e.target.value }))} data-testid={`pge-f-${f.name}`} />
            <button type="button" className="pge-btn" disabled={busy || v === String(f.value ?? '')} onClick={() => void setField(f, Number(v))}>
              {g('save')}
            </button>
          </span>
        </div>
      );
    }
    // label / words: English and Bengali
    const cur = (inputs[f.id] as { en: string; bn: string } | undefined) ?? (f.kind === 'label' ? (f.shown ?? { en: '', bn: '' }) : ((f.value as { en: string; bn: string } | null) ?? { en: '', bn: '' }));
    const base = f.kind === 'label' ? (f.shown ?? { en: '', bn: '' }) : ((f.value as { en: string; bn: string } | null) ?? { en: '', bn: '' });
    const same = cur.en === base.en && cur.bn === base.bn;
    return (
      <fieldset className="pge-fld pge-words" key={f.id}>
        <legend>
          {name} {tag}
        </legend>
        {(['en', 'bn'] as const).map((l) => (
          <label key={l} className="pge-sub">
            <span>{g(l)}</span>
            <textarea rows={2} lang={l} value={cur[l]} onChange={(e) => setInputs((i) => ({ ...i, [f.id]: { ...cur, [l]: e.target.value } }))} data-testid={`pge-f-${f.name}-${l}`} />
          </label>
        ))}
        <button type="button" className="pge-btn pge-pri" disabled={busy || same} onClick={() => void setField(f, cur)} data-testid={`pge-save-${f.name}`}>
          {g('save')}
        </button>
      </fieldset>
    );
  };

  const links = (title: string, items: { name: string; href: string }[], ns: string) =>
    items.length ? (
      <div className="pge-links">
        <p className="pge-mute">{title}</p>
        <ul>
          {items.map((m) => (
            <li key={m.name}>
              <a className="pge-link" href={m.href} target="_blank" rel="noopener">
                {g(`${ns}.${m.name}`)}
              </a>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <>
      <div className="pge-room" aria-hidden="true" style={{ height: room }} />
      {hover && p.edit ? (
        <div className="pge-outline" data-pge-keep="" style={{ top: hover.rect.top, left: hover.rect.left, width: hover.rect.width, height: hover.rect.height }}>
          <button type="button" className="pge-btn pge-pri pge-editbtn" onClick={() => void openSection(hover.id)} data-testid="pge-edit">
            ✎ {g('edit')} · {nameOf(hover.id)}
          </button>
        </div>
      ) : null}

      <div className={`pge${small ? ' pge-small' : ''}`} ref={panel} role="region" aria-label={g('bar.label')} data-testid="pge-bar">
        {small ? (
          <button type="button" className="pge-btn pge-pri" onClick={() => setSmall(false)} data-testid="pge-show">
            ✎ {g('bar.show')}
          </button>
        ) : (
          <>
            <div className="pge-head">
              <strong>{g('bar.label')}</strong>
              <span className="pge-row pge-edit">
                <span id={`${uid}-edit`}>{g('bar.edit')}</span>
                <button type="button" role="switch" aria-checked={p.edit} aria-labelledby={`${uid}-edit`} className={`pge-sw${p.edit ? ' on' : ''}`} onClick={() => setEdit(!p.edit)} data-testid="pge-mode">
                  <span aria-hidden="true" />
                </button>
              </span>
              <button type="button" className="pge-btn" onClick={() => setSmall(true)} aria-label={g('bar.hide')}>
                –
              </button>
            </div>
            <p className="pge-mute" role="status">
              {msg || (locked ? g('bar.locked') : p.edit ? (lightMode ? g('bar.onPhone') : g('bar.on')) : g('bar.off'))}
            </p>
            {p.edit ? (
              <div className="pge-acts">
                {!locked ? (
                  <button type="button" className="pge-btn" disabled={busy} onClick={() => void openPage()} data-testid="pge-sections">
                    {g('bar.sections')}
                  </button>
                ) : null}
                <button type="button" className="pge-btn pge-pri" disabled={busy || !draftN} onClick={startPublish} data-testid="pge-publish">
                  {draftN ? g('bar.publishN', { n: draftN }) : g('bar.publish')}
                </button>
                {view?.last?.canUndo ? (
                  <button type="button" className="pge-btn" disabled={busy} onClick={() => void undo()} data-testid="pge-undo">
                    ↶ {g('bar.undo')}
                  </button>
                ) : null}
                {draftN ? (
                  <button type="button" className="pge-btn" disabled={busy} onClick={() => void discard()} data-testid="pge-discard">
                    {g('bar.discard')}
                  </button>
                ) : null}
                {view?.frontEdit ? (
                  <button type="button" className="pge-btn" onClick={words}>
                    {g('bar.words')}
                  </button>
                ) : (
                  <a className="pge-link" href="/admin/website/words" target="_blank" rel="noopener">
                    {g('bar.wordsOff')}
                  </a>
                )}
              </div>
            ) : null}
            {p.edit ? <p className="pge-mute">{draftN ? g('bar.draftN', { n: draftN }) : g('bar.draftNone')}</p> : null}

            {open ? (
              <div className="pge-side" data-testid="pge-panel">
                <div className="pge-head">
                  {open.kind === 'section' ? (
                    <button type="button" className="pge-btn" onClick={() => void openPage()}>
                      ← {g('back')}
                    </button>
                  ) : (
                    <strong>{g('bar.sections')}</strong>
                  )}
                  <button type="button" className="pge-btn" onClick={() => setOpen(null)} aria-label={g('close')}>
                    ✕
                  </button>
                </div>
                {open.kind === 'page' && list ? (
                  <>
                    <ul className="pge-list">
                      {list.sections.map((s) => (
                        <li key={s.id}>
                          <button type="button" className="pge-item" onClick={() => void openSection(s.id)} data-testid={`pge-sec-${s.id}`}>
                            <span>{nameOf(s.id)}</span>
                            <span className="pge-mute">{s.on ? g('shown') : g('hidden')}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {links(g('moneyTitle'), list.money, 'money')}
                  </>
                ) : null}
                {open.kind === 'section' && section ? (
                  <>
                    <h2 className="pge-title">{nameOf(section.id)}</h2>
                    {lightMode ? <p className="pge-mute">{g('light')}</p> : null}
                    {section.locked ? <p className="pge-note">{g('bar.locked')}</p> : null}
                    <div className="pge-fields">{fields.map(fieldRow)}</div>
                    {links(g('moneyTitle'), section.money, 'money')}
                    {section.more ? links(g('moreTitle'), [section.more], 'more') : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {dlg ? (
        <div className="pge-dlg" role="dialog" aria-modal="true" aria-labelledby={`${uid}-dlg`} data-testid="pge-dialog">
          <div className="pge-dlg-in">
            {dlg === 'phone' ? (
              <>
                <h2 id={`${uid}-dlg`} className="pge-title">
                  {g('pub.phoneConfirm')}
                </h2>
                <div className="pge-acts">
                  <button type="button" className="pge-btn pge-pri" disabled={busy} onClick={() => void publish({ phone: 'phone' })} data-testid="pge-phone-go">
                    {g('pub.phoneGo')}
                  </button>
                  <button type="button" className="pge-btn" onClick={() => setDlg(null)}>
                    {g('pub.cancel')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id={`${uid}-dlg`} className="pge-title">
                  {g('pub.title')}
                </h2>
                <p className="pge-mute">{g('pub.sub')}</p>
                {dlg === 'ask' ? (
                  <>
                    <div className="pge-acts">
                      <button type="button" className="pge-btn pge-pri" onClick={() => void runChecks()} data-testid="pge-yes">
                        {g('pub.yes')}
                      </button>
                      <button type="button" className="pge-btn" disabled={busy} onClick={() => void publish({ phone: 'no' })} data-testid="pge-no">
                        {g('pub.no')}
                      </button>
                      <button type="button" className="pge-btn" onClick={() => setDlg(null)}>
                        {g('pub.cancel')}
                      </button>
                    </div>
                    <p className="pge-mute">{g('pub.noSub')}</p>
                  </>
                ) : null}
                {dlg === 'checking' || dlg === 'checked' ? (
                  <>
                    <p role="status" className="pge-mute">
                      {dlg === 'checking' ? g('pub.checking', { done: results.length, n: view?.cfg.phones.length ?? 0 }) : allPass ? g('pub.allPass') : g('pub.someFail')}
                    </p>
                    <ul className="pge-list pge-results" data-testid="pge-results">
                      {results.map((r) => (
                        <li key={`${r.name}-${r.w}-${r.h}`} className={r.pass ? 'ok' : 'bad'}>
                          <span>
                            {r.name} · {r.w}×{r.h} — <b>{r.pass ? g('pub.pass') : g('pub.fail')}</b>
                            {r.issues.length ? <span className="pge-mute"> ({r.issues.map((i) => g(`pub.issue.${i}`)).join(', ')})</span> : null}
                          </span>
                          <button type="button" className="pge-btn" onClick={() => setPreview({ name: r.name, w: r.w, h: r.h })}>
                            {g('pub.open')}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="pge-mute">{g('pub.farm')}</p>
                    {dlg === 'checked' ? (
                      <>
                        <label className="pge-chk">
                          <input type="checkbox" checked={okTick} disabled={!allPass} onChange={(e) => setOkTick(e.target.checked)} data-testid="pge-ok" />
                          {g('pub.ok')}
                        </label>
                        <div className="pge-acts">
                          <button
                            type="button"
                            className="pge-btn pge-pri"
                            disabled={busy || !allPass || !okTick}
                            onClick={() => void publish({ phone: 'yes', ok: true, checks: { pass: allPass, sizes: results.length, failed: results.filter((r) => !r.pass).length } })}
                            data-testid="pge-go"
                          >
                            {g('pub.go')}
                          </button>
                          <button type="button" className="pge-btn" disabled={busy} onClick={() => void publish({ phone: 'no' })}>
                            {g('pub.no')}
                          </button>
                          <button type="button" className="pge-btn" onClick={() => setDlg(null)}>
                            {g('pub.cancel')}
                          </button>
                        </div>
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="pge-dlg pge-prev" role="dialog" aria-modal="true" aria-label={preview.name}>
          <div className="pge-dlg-in">
            <div className="pge-head">
              <strong>
                {preview.name} · {preview.w}×{preview.h}
              </strong>
              <button type="button" className="pge-btn" onClick={() => setPreview(null)}>
                {g('pub.closePreview')}
              </button>
            </div>
            <div className="pge-frame" style={{ width: preview.w * scale, height: preview.h * scale }}>
              <iframe title={preview.name} src={location.href} width={preview.w} height={preview.h} style={{ transform: `scale(${scale})` }} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
