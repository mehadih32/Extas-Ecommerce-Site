'use client';
// S28 · PR 693 — Inbox › Comments: the Hide / Show and "Message privately" buttons of one comment, and the rules card.
// Every call is one request; a refusal is words from `w5a.err.*`; "practice" is said when the Page's connector is not
// connected yet (nothing reached Meta).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { errWords, Msg } from './Parts';
import { t, type Dict } from '@/lib/i18n';

const API = '/api/admin/support/comments';

export function CommentActions({ dict, id, hidden, canAct }: { dict: Dict; id: string; hidden: boolean; canAct: boolean }) {
  const router = useRouter();
  const c = (k: string) => t(dict, `w5a.comments.${k}`);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(kind: 'hide' | 'private') {
    setBusy(kind);
    const a = kind === 'hide' ? await call('POST', `${API}/${id}/hide`, { hide: !hidden }) : await call('POST', `${API}/${id}/private`, {});
    setBusy('');
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    if (kind === 'private') setMsg({ ok: true, text: a.data.practice ? c('sentPractice') : c('sent') });
    else router.refresh();
  }
  if (!canAct) return null;
  return (
    <div className="a2-stack" style={{ gap: 4, alignItems: 'flex-end' }}>
      <span className="a2-gap8" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="a2-btn sm" disabled={busy !== ''} onClick={() => run('hide')} data-testid={hidden ? 'comment-show' : 'comment-hide'}>
          {hidden ? c('show') : c('hide')}
        </button>
        {!hidden ? (
          <button type="button" className="a2-btn sm" disabled={busy !== ''} onClick={() => run('private')} data-testid="comment-private">
            {c('private')}
          </button>
        ) : null}
      </span>
      <Msg m={msg} />
    </div>
  );
}

export interface DeskValue {
  enabled: boolean;
  hidePhone: boolean;
  hideAbuse: boolean;
  autoPrivate: boolean;
  keywords: string[];
  abuseWords: string[];
  privateTextEn: string;
  privateTextBn: string;
  publicTextEn: string;
  publicTextBn: string;
}

const words = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

/** The desk's rules: three switches, the two word lists and the four texts. Saved whole with the value the page read. */
export function CommentRules({ dict, before }: { dict: Dict; before: DeskValue }) {
  const router = useRouter();
  const c = (k: string) => t(dict, `w5a.comments.${k}`);
  const [v, setV] = useState<DeskValue>(before);
  const [kw, setKw] = useState(before.keywords.join(', '));
  const [ab, setAb] = useState(before.abuseWords.join(', '));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof DeskValue>(k: K, x: DeskValue[K]) => setV((o) => ({ ...o, [k]: x }));
  async function save(next: DeskValue) {
    setBusy(true);
    const a = await call('POST', `${API}/settings`, { before, value: { ...next, keywords: words(kw), abuseWords: words(ab) } });
    setBusy(false);
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    setMsg({ ok: true, text: t(dict, 'w5a.saved') });
    router.refresh();
  }
  const toggle = (k: 'hidePhone' | 'hideAbuse' | 'autoPrivate', label: string, tid: string) => (
    <label className="a2-chkl a2-gap8">
      <input type="checkbox" checked={v[k]} onChange={(e) => set(k, e.target.checked)} data-testid={tid} />
      <span className="a2-sm">{label}</span>
    </label>
  );
  const text = (k: 'privateTextEn' | 'privateTextBn' | 'publicTextEn' | 'publicTextBn', label: string, tid: string) => (
    <label className="a2-stack" style={{ gap: 4 }}>
      <span className="a2-sm">{label}</span>
      <textarea className="a2-inp a2-ta" rows={2} maxLength={500} value={v[k]} onChange={(e) => set(k, e.target.value)} data-testid={tid} />
    </label>
  );
  return (
    <div className="a2-stack" style={{ gap: 10 }} data-testid="comment-rules">
      <label className="a2-chkl a2-gap8">
        <input type="checkbox" checked={v.enabled} onChange={(e) => set('enabled', e.target.checked)} data-testid="desk-enabled" />
        <b className="a2-sm">{c('rEnabled')}</b>
      </label>
      {toggle('hidePhone', c('rPhone'), 'rule-phone')}
      {toggle('hideAbuse', c('rAbuse'), 'rule-abuse')}
      {toggle('autoPrivate', c('rAuto'), 'rule-auto')}
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('rKeywords')}</span>
        <textarea className="a2-inp a2-ta" rows={2} value={kw} onChange={(e) => setKw(e.target.value)} data-testid="rule-keywords" />
        <span className="a2-xs a2-mute">{c('rWordsHint')}</span>
      </label>
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('rAbuseWords')}</span>
        <textarea className="a2-inp a2-ta" rows={2} value={ab} onChange={(e) => setAb(e.target.value)} data-testid="rule-abusewords" />
      </label>
      {text('privateTextEn', c('rPrivEn'), 'rule-priv-en')}
      {text('privateTextBn', c('rPrivBn'), 'rule-priv-bn')}
      {text('publicTextEn', c('rPubEn'), 'rule-pub-en')}
      {text('publicTextBn', c('rPubBn'), 'rule-pub-bn')}
      <div className="a2-gap8" style={{ alignItems: 'center' }}>
        <button type="button" className="a2-btn pri sm" disabled={busy} onClick={() => save(v)} data-testid="rules-save">
          {c('save')}
        </button>
        <Msg m={msg} />
      </div>
    </div>
  );
}
