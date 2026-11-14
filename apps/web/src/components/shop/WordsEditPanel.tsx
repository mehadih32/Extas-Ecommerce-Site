'use client';
// S02 · PR 79 (register "Front-end editing: open the page, change a label, publish"; BACKEND-ARCHITECTURE WEB-05) — the
// panel on a shop page for editing its words: it reads the texts the page shows (text, placeholders, labels for screen
// readers), asks the admin which shop words they are (POST /api/admin/website/front-edit, `website.read`, while
// `language.frontEdit` is on), and lists them. Tap a word on the page (while "Tap a word" is ticked) or in the list to
// open it; your English and Bengali (empty = the shop's word) show on the page at once as a preview; "Publish" saves
// every changed word in one go through Website › Words & language's save (PUT /api/admin/website/dictionary,
// `website.words.write`; same checks, STALE, audited) and reloads the page. "Discard changes" puts the page back;
// "Stop editing" ends the mode for this tab. Only loaded by components/shop/WordsEditLoader. Words:
// messages/words-edit.<lang>.json (the page's language).
// PR 79 follow-up (676, 6 Nov): a word with {slots} or "|" pieces previews at once too (lib/website/words-match
// previewText: the values the shop filled in are kept; a draft with another number of pieces shows after Publish).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { previewText, type PageWord } from '@/lib/website/words-match';
import bnWords from '../../../messages/words-edit.bn.json';
import enWords from '../../../messages/words-edit.en.json';
import './words-edit.css';
import { ADMIN_LOGIN } from '@/lib/admin-nav';

const PAGE_API = '/api/admin/website/front-edit';
const SAVE_API = '/api/admin/website/dictionary';
const LOGIN = ADMIN_LOGIN; // CN-053: the staff sign-in address
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'] as const;
/** How many ancestors a tap on the page climbs to find a word (a tap often lands on an icon inside the button). */
const CLIMB = 5;

type Lang = 'en' | 'bn';
type Own = { en: string; bn: string };
type State = { kind: 'loading' } | { kind: 'ready'; version: string; canEdit: boolean; words: PageWord[] } | { kind: 'stop'; why: 'signIn' | 'off' | 'denied' | 'other' };

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
const slotsOf = (s: string) => [...new Set([...s.matchAll(/\{\w+\}/g)].map((m) => m[0]))];

interface Seen {
  /** Text nodes showing a text, by the text. */
  nodes: Map<string, Text[]>;
  /** Elements whose attribute or own text is a text, by the text. */
  els: Map<string, Element[]>;
}

/** Every text the page shows outside the panel. */
function readPage(panel: Element | null): Seen {
  const nodes = new Map<string, Text[]>();
  const els = new Map<string, Element[]>();
  const add = <T,>(m: Map<string, T[]>, k: string, v: T) => m.set(k, [...(m.get(k) ?? []), v]);
  const root = document.getElementById('app') ?? document.body;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const p = n.parentElement;
    if (!p || (panel && panel.contains(p)) || p.closest('script,style,noscript,template')) continue;
    const text = norm(n.nodeValue ?? '');
    if (!text) continue;
    add(nodes, text, n as Text);
    add(els, text, p);
  }
  for (const el of root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
    if (panel && panel.contains(el)) continue;
    for (const a of ATTRS) {
      const text = norm(el.getAttribute(a) ?? '');
      if (text) add(els, text, el);
    }
  }
  return { nodes, els };
}

async function send(method: 'POST' | 'PUT', url: string, payload: unknown): Promise<{ status: number; a: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    return { status: res.status, a: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { status: 0, a: { error: 'network' } };
  }
}

export function WordsEditPanel({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const seen = useRef<Seen>({ nodes: new Map(), els: new Map() });
  /** Text nodes the preview changed, with their text before. */
  const before = useRef(new Map<Text, string>());
  const lit = useRef<HTMLElement[]>([]);
  const [lang] = useState<Lang>(() => ((document.getElementById('app')?.getAttribute('lang') ?? document.documentElement.lang) === 'bn' ? 'bn' : 'en'));
  const w = (lang === 'bn' ? bnWords : enWords).wde;
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [drafts, setDrafts] = useState<Record<string, Own>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [pick, setPick] = useState(true);
  const [small, setSmall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const look = useCallback(async () => {
    setState({ kind: 'loading' });
    seen.current = readPage(box.current);
    const texts = [...new Set([...seen.current.nodes.keys(), ...seen.current.els.keys()])];
    const { status, a } = await send('POST', PAGE_API, { lang, texts });
    if (status === 200 && a.ok) return setState({ kind: 'ready', version: String(a.version), canEdit: a.canEdit === true, words: (a.words as PageWord[]) ?? [] });
    setState({ kind: 'stop', why: status === 401 ? 'signIn' : a.error === 'FRONT_EDIT_OFF' ? 'off' : status === 403 ? 'denied' : 'other' });
  }, [lang]);

  useEffect(() => {
    // the first look once the page has drawn (the panel itself is a client component, so the page is already there)
    const id = window.setTimeout(() => void look(), 0);
    return () => window.clearTimeout(id);
  }, [look]);

  const words = useMemo(() => (state.kind === 'ready' ? state.words : []), [state]);
  /** Which words showed as a text. */
  const byText = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const x of words) for (const t of x.seen) m.set(t, [...(m.get(t) ?? []), x.key]);
    return m;
  }, [words]);
  const shown = (x: PageWord, d: Own | undefined) => (d ? d[lang] || x.byDefault[lang] : x.own[lang] || x.byDefault[lang]);
  const changedKeys = Object.keys(drafts).filter((k) => {
    const x = words.find((y) => y.key === k);
    return x && (drafts[k]!.en !== x.own.en || drafts[k]!.bn !== x.own.bn);
  });

  const unlight = () => {
    for (const el of lit.current) el.classList.remove('wde-lit');
    lit.current = [];
  };
  const light = useCallback((x: PageWord, scroll: boolean) => {
    unlight();
    const els = x.seen.flatMap((t) => seen.current.els.get(t) ?? []).filter((el): el is HTMLElement => el instanceof HTMLElement);
    for (const el of els) el.classList.add('wde-lit');
    lit.current = els;
    if (scroll && els[0]) els[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  /** Shows a word's draft on the page; ~~exact words only; a word with {slots} is seen after Publish~~ (676) every word. */
  const preview = (x: PageWord, d: Own) => {
    const drawn = x.own[lang] || x.byDefault[lang];
    for (const t of x.seen) {
      const now = previewText(drawn, shown(x, d), t);
      if (now === null) continue;
      for (const n of seen.current.nodes.get(t) ?? []) {
        if (!before.current.has(n)) before.current.set(n, n.nodeValue ?? '');
        const was = before.current.get(n)!;
        n.nodeValue = was.replace(t, now);
      }
    }
  };
  const restore = () => {
    for (const [n, v] of before.current) n.nodeValue = v;
    before.current.clear();
  };

  const edit = (x: PageWord, lang2: Lang, v: string) => {
    const d = { ...(drafts[x.key] ?? x.own), [lang2]: v };
    setDrafts({ ...drafts, [x.key]: d });
    preview(x, d);
  };

  /** Both languages back to the shop's word (published with the rest). */
  const back = (x: PageWord) => {
    const d = { en: '', bn: '' };
    setDrafts({ ...drafts, [x.key]: d });
    preview(x, d);
  };

  const openWord = useCallback(
    (key: string, scroll: boolean) => {
      const x = words.find((y) => y.key === key);
      if (!x) return;
      setOpen(key);
      setSmall(false);
      light(x, scroll);
      window.setTimeout(() => box.current?.querySelector(`[data-wde-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' }), 0);
    },
    [words, light],
  );

  // "Tap a word on the page": the tap opens the word instead of following a link or a button
  useEffect(() => {
    if (!pick || state.kind !== 'ready') return;
    const onTap = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target || box.current?.contains(target)) return;
      let el: Element | null = target;
      for (let i = 0; el && i < CLIMB; i += 1, el = el.parentElement) {
        const texts = [norm(el.textContent ?? ''), ...ATTRS.map((a) => norm(el!.getAttribute(a) ?? ''))].filter(Boolean);
        const key = texts.map((t) => byText.get(t)?.[0]).find(Boolean);
        if (key) {
          e.preventDefault();
          e.stopPropagation();
          openWord(key, false);
          return;
        }
      }
    };
    document.addEventListener('click', onTap, true);
    return () => document.removeEventListener('click', onTap, true);
  }, [pick, state.kind, byText, openWord]);

  useEffect(() => () => unlight(), []);

  async function publish() {
    if (state.kind !== 'ready' || !changedKeys.length) return;
    setBusy(true);
    setMsg(null);
    const { status, a } = await send('PUT', SAVE_API, { version: state.version, words: Object.fromEntries(changedKeys.map((k) => [k, drafts[k]])) });
    setBusy(false);
    if (status === 200 && a.ok) {
      setMsg({ ok: true, text: w.published });
      window.setTimeout(() => window.location.reload(), 900);
      return;
    }
    const code = typeof a.error === 'string' ? a.error : status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'other';
    const details = Array.isArray(a.details) ? a.details.join(', ') : '';
    setMsg({ ok: false, text: ((w.err as Record<string, string>)[code] ?? w.err.other).replace('{details}', details) });
  }

  function discard() {
    restore();
    setDrafts({});
    setMsg(null);
  }

  function stop() {
    restore();
    unlight();
    onClose();
  }

  const n = state.kind === 'ready' ? state.words.length : 0;
  if (small)
    return (
      <div className="wde wde-small" ref={box} data-wde="" lang={lang}>
        <button type="button" className="wde-btn wde-pri" onClick={() => setSmall(false)} data-testid="wde-show">
          {fill(w.show, { n })}
        </button>
      </div>
    );

  return (
    <div className="wde" ref={box} data-wde="" lang={lang} role="dialog" aria-label={w.title} data-testid="wde">
      <div className="wde-head">
        <div>
          <b>{w.title}</b>
          {state.kind === 'ready' ? <span className="wde-mute"> · {fill(w.count, { n })}</span> : null}
        </div>
        <div className="wde-acts">
          <button type="button" className="wde-btn" onClick={() => setSmall(true)} data-testid="wde-hide">
            {w.hide}
          </button>
          <button type="button" className="wde-btn" onClick={stop} data-testid="wde-close">
            {w.close}
          </button>
        </div>
      </div>
      {state.kind === 'loading' ? <p className="wde-note">{w.loading}</p> : null}
      {state.kind === 'stop' ? (
        <p className="wde-note" role="alert" data-testid="wde-stop">
          {state.why === 'signIn' ? w.signIn : state.why === 'off' ? w.off : state.why === 'denied' ? w.denied : w.err.other}{' '}
          {state.why === 'signIn' ? (
            <a className="wde-link" href={`${LOGIN}?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}>
              {w.signInLink}
            </a>
          ) : null}
        </p>
      ) : null}
      {state.kind === 'ready' ? (
        <>
          <div className="wde-bar">
            <label className="wde-chk">
              <input type="checkbox" checked={pick} onChange={(e) => setPick(e.target.checked)} data-testid="wde-pick" />
              <span>{w.pick}</span>
            </label>
            <button type="button" className="wde-btn" onClick={() => void look()} data-testid="wde-again">
              {w.again}
            </button>
          </div>
          {!state.canEdit ? <p className="wde-note">{w.readOnly}</p> : null}
          {n ? null : <p className="wde-note">{w.none}</p>}
          <ul className="wde-list" data-testid="wde-list">
            {state.words.map((x) => {
              const d = drafts[x.key];
              const isOpen = open === x.key;
              const dirty = changedKeys.includes(x.key);
              return (
                <li key={x.key} className={`wde-row${isOpen ? ' on' : ''}`} data-wde-key={x.key} data-testid="wde-row">
                  <button type="button" className="wde-word" aria-expanded={isOpen} onClick={() => (isOpen ? (setOpen(null), unlight()) : openWord(x.key, true))} onMouseEnter={() => light(x, false)} onMouseLeave={() => !isOpen && unlight()}>
                    <span className="wde-text">{shown(x, d)}</span>
                    <span className="wde-mute wde-key">
                      {x.key}
                      {dirty ? ` · ${w.draft}` : x.changed ? ` · ${w.changed}` : ''}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="wde-form">
                      {(['en', 'bn'] as const).map((l) => (
                        <label key={l} className="wde-fld">
                          <span>{l === 'en' ? w.yourEn : w.yourBn}</span>
                          <textarea
                            lang={l}
                            rows={2}
                            maxLength={300}
                            disabled={!state.canEdit}
                            value={(d ?? x.own)[l]}
                            placeholder={x.byDefault[l]}
                            onChange={(e) => edit(x, l, e.target.value)}
                            data-testid={`wde-in-${l}`}
                          />
                          <span className="wde-mute">
                            {w.shopWord}: {x.byDefault[l]}
                          </span>
                        </label>
                      ))}
                      <p className="wde-mute">
                        {w.emptyHelp}
                        {slotsOf(x.byDefault.en).length ? ` · ${fill(w.slotsHelp, { slots: slotsOf(x.byDefault.en).join(' ') })}` : ''}
                      </p>
                      {state.canEdit && (x.own.en || x.own.bn || d?.en || d?.bn) ? (
                        <button type="button" className="wde-btn" onClick={() => back(x)} data-testid="wde-back">
                          {w.back}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {state.canEdit ? (
            <div className="wde-foot">
              <button type="button" className="wde-btn wde-pri" disabled={busy || !changedKeys.length} onClick={() => void publish()} data-testid="wde-publish">
                {busy ? w.publishing : fill(w.publish, { n: changedKeys.length })}
              </button>
              <button type="button" className="wde-btn" disabled={busy || !Object.keys(drafts).length} onClick={discard} data-testid="wde-discard">
                {w.discard}
              </button>
            </div>
          ) : null}
          {msg ? (
            <p className="wde-note" role={msg.ok ? 'status' : 'alert'} data-testid="wde-msg">
              {msg.text}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
