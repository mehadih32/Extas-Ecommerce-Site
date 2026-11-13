'use client';
// S12 · PR 529 — "Write from a link": a web address and a language; one button reads the page, researches the topic
// and writes an original first draft, landing in the article editor as an article in writing (marked AI-assisted,
// with the link kept). Without `blog.write` it is read-only. Says why it is closed (AI off for the shop, the feature
// off, or today's drafts used up) instead of showing a dead button.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import type { SourceWriterBlock } from '@/lib/journal/source-link';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

const EDITOR = '/admin/website/blog';
const URL_MAX = 2000;

export function SourceLinkForm(p: { words: Dict; block: SourceWriterBlock | null; used: number; dailyMax: number; canWrite: boolean }) {
  const id = useId();
  const router = useRouter();
  const l = (k: string, vars?: Record<string, string | number>) => t(p.words, `jr.src.${k}`, vars);
  const [url, setUrl] = useState('');
  const [locale, setLocale] = useState<'en' | 'bn'>('en');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const off = busy || !p.canWrite || !!p.block;

  async function go() {
    setBusy(true);
    const a = await call('POST', '/api/admin/blog/source-link', { url: url.trim(), locale });
    setBusy(false);
    if (a.status === 200 && typeof a.data.postId === 'string') {
      showToast({ text: l(a.data.practice ? 'donePractice' : 'done'), tone: 'ok' });
      return router.push(`${EDITOR}/${a.data.postId}`);
    }
    const code = a.status === 0 ? 'network' : a.status === 401 ? 'unauthorized' : (a.data.error ?? 'other');
    const txt = l(`err_${code}`);
    setSaid({ text: txt === `jr.src.err_${code}` ? t(p.words, 'jr.err.other') : txt, bad: true });
  }

  return (
    <form
      className="jr-form"
      data-testid="src-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!off && url.trim()) void go();
      }}
    >
      {p.block ? (
        <p className="a2-sm a2-bad" role="note" data-testid="src-blocked">
          {l(`b_${p.block}`)}
        </p>
      ) : null}
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${id}-url`}>
          {l('url')}
        </label>
        <span className="a2-def a2-blk">{l('urlHelp')}</span>
        <input id={`${id}-url`} className="a2-inp" type="url" maxLength={URL_MAX} value={url} onChange={(e) => setUrl(e.target.value)} disabled={off} required data-testid="src-url" />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${id}-lang`}>
          {l('language')}
        </label>
        <select id={`${id}-lang`} className="a2-sel" value={locale} onChange={(e) => setLocale(e.target.value === 'bn' ? 'bn' : 'en')} disabled={off} data-testid="src-lang">
          <option value="en">{l('en')}</option>
          <option value="bn">{l('bn')}</option>
        </select>
      </div>
      <div className="jr-steps a2-mt12">
        <button type="submit" className="a2-btn pri" disabled={off || !url.trim()} data-testid="src-go">
          {busy ? l('going') : l('go')}
        </button>
        {p.block === null ? <p className="a2-sm a2-mute">{l('used', { n: p.used, max: p.dailyMax })}</p> : null}
      </div>
      {said ? (
        <p className={`a2-sm jr-said${said.bad ? ' a2-bad' : ''}`} role="status" data-testid="src-said">
          {said.text}
        </p>
      ) : null}
    </form>
  );
}
