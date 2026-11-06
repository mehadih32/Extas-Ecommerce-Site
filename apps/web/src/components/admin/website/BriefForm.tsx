'use client';
// S12 · PR 528 (S12 answer 11; demo 97x-adm2-website.js "Topics & briefs") — the blog brief form: first the four things
// chosen before a word is written (the topic — one of the plan's or a new one —, its language, how many words, the
// keywords), then what helps the writer (search phrase, intent, outline, facts, shop links, photos, pictures, a note).
// Saves with the version it was read at; a new topic very close to another needs a second press. Without `blog.write`
// it is read-only.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { IMAGE_POLICIES, INTENTS, LINES_MAX, LINE_MAX, NOTE_MAX } from '@/lib/journal/briefs-model';
import { KEYWORDS_MAX, QUERY_MAX } from '@/lib/journal/clusters-model';
import { TITLE_MAX } from '@/lib/journal/model';
import type { BriefScreen } from '@/lib/journal/briefs';
import { call } from '../api';

const EDITOR = '/admin/website/blog';
const HERE = '/admin/website/blog/briefs';
const NEW_TOPIC = 'new';
const FIELD: Record<string, string> = { topicId: 'topic', title: 'topicTitle', language: 'language', wordCount: 'words', keywords: 'keywords', query: 'query', outline: 'outline', mustInclude: 'mustInclude', links: 'links', shotList: 'shotList', notes: 'notes' };

export function BriefForm(p: { words: Dict; screen: BriefScreen; canWrite: boolean }) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.words, `jr.${k}`, vars);
  const l = (k: string, vars?: Record<string, string | number>) => c(`br.${k}`, vars);
  const b = p.screen.brief;
  const set = p.screen.card.value;
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [force, setForce] = useState(false);
  const [f, setF] = useState({
    topicId: b.topicId ?? (p.screen.topics.length ? '' : NEW_TOPIC),
    title: '',
    language: b.language as string,
    wordCount: String(b.wordCount),
    keywords: b.keywords.join(', '),
    query: b.query ?? '',
    intent: b.intent as string,
    outline: b.outline.join('\n'),
    mustInclude: b.mustInclude ?? '',
    links: b.links.join('\n'),
    shotList: b.shotList.join('\n'),
    imagePolicy: b.imagePolicy as string,
    notes: b.notes ?? '',
  });
  const on = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const off = busy || !p.canWrite;
  const locked = !!b.postId; // the topic stays once the article is started

  async function save() {
    setBusy(true);
    const isNew = !b.id;
    const newTopic = f.topicId === NEW_TOPIC;
    const payload = {
      ...(b.version ? { version: b.version } : {}),
      topicId: newTopic || !f.topicId ? null : f.topicId,
      ...(newTopic ? { title: f.title } : {}),
      language: f.language,
      wordCount: f.wordCount,
      keywords: f.keywords,
      query: f.query,
      intent: f.intent,
      outline: f.outline,
      mustInclude: f.mustInclude,
      links: f.links,
      shotList: f.shotList,
      imagePolicy: f.imagePolicy,
      notes: f.notes,
      ...(force ? { force: true } : {}),
    };
    const a = await call(isNew ? 'POST' : 'PUT', isNew ? '/api/admin/blog/briefs' : `/api/admin/blog/briefs/${b.id}`, payload);
    setBusy(false);
    if (a.status === 200 || a.status === 201) {
      setSaid({ text: l('saved'), bad: false });
      setForce(false);
      if (isNew && typeof a.data.id === 'string') return router.push(`${HERE}/${a.data.id}`);
      return router.refresh();
    }
    const code = a.data.error ?? 'other';
    const d = a.data.details ?? [];
    const k = a.status === 0 ? 'network' : a.status === 401 ? 'unauthorized' : code;
    const txt = c(`err.${k}`, { fields: code === 'ALIKE' ? d.join(', ') : d.map((x) => l(FIELD[x] ?? x)).join(', '), paths: d.join(', ') });
    setSaid({ text: txt === `jr.err.${k}` ? c('err.other') : txt, bad: true });
    if (code === 'ALIKE') setForce(true);
    if (code === 'STALE') router.refresh();
  }

  const lab = (key: string, label: string, help?: string) => (
    <>
      <label className="a2-lbl" htmlFor={`${id}-${key}`}>
        {label}
      </label>
      {help ? <span className="a2-def a2-blk">{help}</span> : null}
    </>
  );
  const sel = (key: keyof typeof f, label: string, opts: [string, string][], disabled = false) => (
    <div className="a2-fld">
      {lab(key, label)}
      <select id={`${id}-${key}`} className="a2-sel" value={f[key]} disabled={off || disabled} onChange={(e) => on(key)(e.target.value)} data-testid={`br-${key}`}>
        {opts.map(([v, w]) => (
          <option key={v} value={v}>
            {w}
          </option>
        ))}
      </select>
    </div>
  );
  const inp = (key: keyof typeof f, label: string, max: number, help?: string, extra: Record<string, unknown> = {}) => (
    <div className="a2-fld">
      {lab(key, label, help)}
      <input id={`${id}-${key}`} className="a2-inp" value={f[key]} maxLength={max} lang={f.language} disabled={off} onChange={(e) => on(key)(e.target.value)} data-testid={`br-${key}`} {...extra} />
    </div>
  );
  const area = (key: keyof typeof f, label: string, max: number, help?: string) => (
    <div className="a2-fld">
      {lab(key, label, help)}
      <textarea id={`${id}-${key}`} className="a2-inp" rows={4} value={f[key]} maxLength={max} lang={f.language} disabled={off} onChange={(e) => on(key)(e.target.value)} data-testid={`br-${key}`} />
    </div>
  );
  const lineMax = LINES_MAX * (LINE_MAX + 1);

  return (
    <div className="jr-stack" data-testid="br-form">
      <section className="a2-card a2-sc" aria-labelledby={`${id}-must`}>
        <h2 className="a2-h3" id={`${id}-must`}>
          {l('must')}
        </h2>
        {b.id ? (
          <p className={`a2-sm${b.gaps.length ? ' a2-bad' : ''}`} data-testid="br-status">
            {b.gaps.length ? l('missing', { fields: b.gaps.map((g) => l(g)).join(', ') }) : l('ready')}
            {b.topicStatus ? ` · ${l('topicState', { state: c(`pl.st.${b.topicStatus}`) })}` : ''}
          </p>
        ) : null}
        {!p.screen.topics.length && !b.topicId ? <p className="a2-sm a2-mute">{l('none')}</p> : null}
        {sel(
          'topicId',
          l('topic'),
          [...(f.topicId === '' ? [['', l('topicPick')] as [string, string]] : []), ...p.screen.topics.map((x): [string, string] => [x.id, x.title]), ...(b.topicId && !p.screen.topics.some((x) => x.id === b.topicId) ? [[b.topicId, b.topicTitle ?? ''] as [string, string]] : []), ...(locked ? [] : [[NEW_TOPIC, l('topicNew')] as [string, string]])],
          locked,
        )}
        {f.topicId === NEW_TOPIC ? inp('title', l('topicTitle'), TITLE_MAX, l('topicNewHelp')) : null}
        {sel('language', l('language'), [
          ['en', l('en')],
          ['bn', l('bn')],
        ])}
        {inp('wordCount', l('words'), String(set.wordsMax).length, l('wordsHelp', { min: set.wordsMin, max: set.wordsMax }), { type: 'number', inputMode: 'numeric', min: set.wordsMin, max: set.wordsMax })}
        {inp('keywords', l('keywords'), KEYWORDS_MAX * (QUERY_MAX + 2), l('keywordsHelp'))}
      </section>
      <section className="a2-card a2-sc" aria-labelledby={`${id}-help`}>
        <h2 className="a2-h3" id={`${id}-help`}>
          {l('help')}
        </h2>
        {inp('query', l('query'), QUERY_MAX)}
        {sel(
          'intent',
          l('intent'),
          INTENTS.map((x): [string, string] => [x, l(`i_${x}`)]),
        )}
        {area('outline', l('outline'), lineMax, l('outlineHelp'))}
        {area('mustInclude', l('mustInclude'), NOTE_MAX, l('mustIncludeHelp'))}
        {area('links', l('links'), lineMax, l('linksHelp'))}
        {area('shotList', l('shotList'), lineMax, l('shotListHelp'))}
        {sel(
          'imagePolicy',
          l('imagePolicy'),
          IMAGE_POLICIES.map((x): [string, string] => [x, l(`img_${x}`)]),
        )}
        {area('notes', l('notes'), NOTE_MAX)}
        <div className="jr-steps a2-mt12">
          {p.canWrite ? (
            <button type="button" className="a2-btn pri" disabled={busy} onClick={save} data-testid="br-save">
              {busy ? l('saving') : force ? l('addAnyway') : l('save')}
            </button>
          ) : null}
          {b.postId ? (
            <Link className="a2-btn" href={`${EDITOR}/${b.postId}`} data-testid="br-open">
              {l('openPost')}
            </Link>
          ) : null}
        </div>
        {said ? (
          <p className={`a2-sm jr-said${said.bad ? ' a2-bad' : ''}`} role="status">
            {said.text}
          </p>
        ) : null}
      </section>
    </div>
  );
}
