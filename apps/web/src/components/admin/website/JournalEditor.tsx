'use client';
// S12 · PR 240 (Blueprint WEB-03a, demo 94-admin-blog.js) — the article editor: language, title, link, category,
// author, summary, the text in the journal's writing format, the one-line answer, the search description and focus
// keyword, the products of the product block and "show first"; a preview drawn by the shop's own ArticleBody; the steps
// open in the article's state (start writing, pass a check, send back, schedule, publish, take down, put away, restore;
// publish, take down and put away ask once more); and the review history. Saving sends the version it was read at
// (STALE = someone changed it; the page is read again). Without `blog.write` everything is read-only; the publishing
// steps need `blog.publish`.
// PR 592 follow-up: the expert reviewer (an author record, never the article's own author) and the tags (one line, split
// at commas).
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { ArticleBody } from '@/components/journal/ArticleBody';
import { t, type Dict } from '@/lib/i18n';
import { readingMinutes, slugify, wordCount, type BlogAction, type BlogState } from '@/lib/journal/model';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

export interface EditorPost {
  id: string | null;
  locale: 'en' | 'bn';
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  status: BlogState;
  featured: boolean;
  categoryId: string | null;
  authorId: string | null;
  reviewerAuthorId: string | null;
  tags: string[];
  metaDescription: string | null;
  focusKeyword: string | null;
  quickAnswer: string | null;
  productIds: string[];
  scheduledAt: string | null;
  live: boolean;
  actions: BlogAction[];
  gaps: string[];
  reviews: { stage: string; verdict: string; notes: string | null; reviewer: string | null; at: string }[];
  version: string | null;
}

const API = '/api/admin/blog/posts';
const ASK: readonly BlogAction[] = ['publish', 'unpublish', 'archive'];
const PUBLISHING: readonly BlogAction[] = ['schedule', 'unschedule', 'publish', 'unpublish'];
/** A stored instant as the browser's `datetime-local` value (its own clock), and back. */
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function JournalEditor(p: {
  words: Dict;
  post: EditorPost;
  categories: { id: string; nameEn: string; nameBn: string | null; parentId: string | null }[];
  authors: { id: string; displayName: string; isAiAuthor: boolean }[];
  products: { id: string; name: string; onSale: boolean }[];
  reading: { wordsPerMinuteEn: number; wordsPerMinuteBn: number; minMinutes: number };
  lang: 'en' | 'bn';
  locale: string;
  timeZone: string;
  canWrite: boolean;
  canPublish: boolean;
  listHref: string;
}) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.words, `jr.${k}`, vars);
  const pg = p.post;
  const [locale, setLocale] = useState<'en' | 'bn'>(pg.locale);
  const [title, setTitle] = useState(pg.title);
  const [slug, setSlug] = useState(pg.slug);
  const [slugTouched, setSlugTouched] = useState(!!pg.id);
  const [categoryId, setCategoryId] = useState(pg.categoryId ?? '');
  const [authorId, setAuthorId] = useState(pg.authorId ?? '');
  const [reviewerId, setReviewerId] = useState(pg.reviewerAuthorId ?? '');
  const [tags, setTags] = useState(pg.tags.join(', '));
  const [excerpt, setExcerpt] = useState(pg.excerpt ?? '');
  const [body, setBody] = useState(pg.body);
  const [quick, setQuick] = useState(pg.quickAnswer ?? '');
  const [meta, setMeta] = useState(pg.metaDescription ?? '');
  const [keyword, setKeyword] = useState(pg.focusKeyword ?? '');
  const [productIds, setProductIds] = useState<string[]>(pg.productIds);
  const [featured, setFeatured] = useState(pg.featured);
  const [when, setWhen] = useState(toLocal(pg.scheduledAt));
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<BlogAction | null>(null);
  const [dirty, setDirty] = useState(!pg.id);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const ro = !p.canWrite || pg.status === 'ARCHIVED' || ((pg.status === 'PUBLISHED' || pg.status === 'SCHEDULED') && !p.canPublish);
  const off = ro || busy;
  const touch =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setDirty(true);
      setAsk(null);
    };
  const words = wordCount(body);
  const minutes = readingMinutes(words, locale, p.reading);
  const name = (x: { nameEn: string; nameBn: string | null }) => (p.lang === 'bn' && x.nameBn ? x.nameBn : x.nameEn);
  const fieldWords = (f: string[]) => f.map((x) => c(`f.${x}`)).join(', ');

  function errText(a: { status: number; data: { error?: string; details?: string[] } }) {
    if (a.status === 0) return c('err.network');
    if (a.status === 401) return c('err.unauthorized');
    const code = a.data.error ?? 'other';
    const k = `err.${code}`;
    const txt = c(k, { fields: fieldWords(a.data.details ?? []), paths: (a.data.details ?? []).join(', ') });
    return txt === `jr.${k}` ? c('err.other') : txt;
  }

  async function save() {
    setBusy(true);
    const a = await call(pg.id ? 'PUT' : 'POST', pg.id ? `${API}/${pg.id}` : API, {
      ...(pg.version ? { version: pg.version } : {}),
      locale,
      title,
      slug,
      excerpt,
      body,
      categoryId: categoryId || null,
      authorId: authorId || null,
      reviewerAuthorId: reviewerId || null,
      tags: tags.split(/[,،]/).map((x) => x.trim()).filter(Boolean),
      metaDescription: meta,
      focusKeyword: keyword,
      quickAnswer: quick,
      productIds,
      featured,
    });
    setBusy(false);
    if (a.status === 200 || a.status === 201) {
      setDirty(false);
      showToast({ text: c('e.saved'), tone: 'ok' });
      const nid = (a.data.post as { id?: string } | undefined)?.id;
      if (!pg.id && nid) return router.replace(`${p.listHref}/${nid}`);
      return router.refresh();
    }
    setSaid({ text: errText(a), bad: true });
    if (a.status === 409 && a.data.error === 'STALE') router.refresh();
  }

  async function step(s: BlogAction) {
    if (dirty) return setSaid({ text: c('e.unsavedFirst'), bad: true });
    if (ASK.includes(s) && ask !== s) return setAsk(s);
    setAsk(null);
    setBusy(true);
    const a = await call('POST', `${API}/${pg.id}`, { action: s, version: pg.version, ...(note.trim() ? { notes: note.trim() } : {}), ...(s === 'schedule' ? { scheduledAt: when ? new Date(when).toISOString() : null } : {}) });
    setBusy(false);
    if (a.status === 200) {
      setNote('');
      showToast({ text: c(`state.${(a.data.post as { status: BlogState }).status}`), tone: 'ok' });
      return router.refresh();
    }
    setSaid({ text: errText(a), bad: true });
    if (a.status === 409 && a.data.error === 'STALE') router.refresh();
  }

  const fld = (key: string, label: string, el: ReactNode, help?: string) => (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={`${id}-${key}`}>
        {label}
      </label>
      {el}
      {help ? (
        <div className="a2-help a2-xs a2-mute" id={`${id}-${key}-h`}>
          {help}
        </div>
      ) : null}
    </div>
  );
  const at = (iso: string) => new Intl.DateTimeFormat(p.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: p.timeZone, numberingSystem: 'latn' }).format(new Date(iso));
  const stepLabel = (s: BlogAction) => (s === 'pass' ? c(`e.passStep.${pg.status}`) : c(`e.act.${s}`));
  const steps = pg.id && !dirty ? pg.actions.filter((s) => (PUBLISHING.includes(s) ? p.canPublish : p.canWrite)) : [];
  const picked = productIds.map((x) => p.products.find((y) => y.id === x)).filter((x): x is (typeof p.products)[number] => !!x);

  return (
    <div className="jr-grid a2-mt12" data-testid="jr-editor">
      <div className="jr-stack">
        {ro ? (
          <div className="a2-note" role="note">
            {c('e.readOnly')}
          </div>
        ) : null}
        <section className="a2-card a2-sc" aria-labelledby={`${id}-w`}>
          <h2 className="a2-h3" id={`${id}-w`}>
            {c('e.words')}
          </h2>
          <div className="jr-g2 a2-mt12">
            {fld(
              'lg',
              c('e.lang'),
              <select id={`${id}-lg`} className="a2-sel" value={locale} disabled={off} onChange={(e) => touch(setLocale)(e.target.value === 'bn' ? 'bn' : 'en')} data-testid="jr-lang">
                <option value="en">{c('lang.en')}</option>
                <option value="bn">{c('lang.bn')}</option>
              </select>,
            )}
            {fld(
              'ti',
              c('e.titleF'),
              <input
                id={`${id}-ti`}
                className="a2-inp"
                value={title}
                maxLength={160}
                lang={locale}
                disabled={off}
                onChange={(e) => {
                  touch(setTitle)(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
                data-testid="jr-title"
              />,
            )}
            {fld(
              'sl',
              c('e.link'),
              <input
                id={`${id}-sl`}
                className="a2-inp a2-mono"
                value={slug}
                maxLength={80}
                disabled={off}
                aria-describedby={`${id}-sl-h`}
                onChange={(e) => {
                  setSlugTouched(true);
                  touch(setSlug)(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]+/g, '-')
                      .replace(/-{2,}/g, '-')
                      .replace(/^-+/, ''),
                  );
                }}
                onBlur={() => setSlug(slugify(slug))}
                data-testid="jr-slug"
              />,
              c('e.linkHelp', { path: `${locale === 'bn' ? '/bn' : ''}/journal/${slug || '…'}` }),
            )}
            {fld(
              'ct',
              c('e.category'),
              <select id={`${id}-ct`} className="a2-sel" value={categoryId} disabled={off} onChange={(e) => touch(setCategoryId)(e.target.value)} data-testid="jr-category">
                <option value="">{c('e.categoryNone')}</option>
                {p.categories
                  .filter((x) => !x.parentId)
                  .flatMap((m) => [m, ...p.categories.filter((x) => x.parentId === m.id)])
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.parentId ? `— ${name(x)}` : name(x)}
                    </option>
                  ))}
              </select>,
            )}
            {fld(
              'au',
              c('e.author'),
              <select id={`${id}-au`} className="a2-sel" value={authorId} disabled={off} onChange={(e) => touch(setAuthorId)(e.target.value)} data-testid="jr-author">
                <option value="">{c('e.authorNone')}</option>
                {p.authors.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.isAiAuthor ? `${x.displayName} (${c('e.ai')})` : x.displayName}
                  </option>
                ))}
              </select>,
            )}
          </div>
          <div className="jr-g2">
            {fld(
              'rv',
              c('e.reviewer'),
              <select id={`${id}-rv`} className="a2-sel" value={reviewerId} disabled={off} aria-describedby={`${id}-rv-h`} onChange={(e) => touch(setReviewerId)(e.target.value)} data-testid="jr-reviewer">
                <option value="">{c('e.reviewerNone')}</option>
                {p.authors
                  .filter((x) => x.id !== authorId)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.isAiAuthor ? `${x.displayName} (${c('e.ai')})` : x.displayName}
                    </option>
                  ))}
              </select>,
              c('e.reviewerHelp'),
            )}
            {fld(
              'tg',
              c('e.tags'),
              <input id={`${id}-tg`} className="a2-inp" value={tags} maxLength={600} lang={locale} disabled={off} aria-describedby={`${id}-tg-h`} onChange={(e) => touch(setTags)(e.target.value)} data-testid="jr-tags" />,
              c('e.tagsHelp'),
            )}
          </div>
          {fld('ex', c('e.excerpt'), <textarea id={`${id}-ex`} className="a2-inp" value={excerpt} maxLength={300} lang={locale} disabled={off} onChange={(e) => touch(setExcerpt)(e.target.value)} />)}
          {fld('qa', c('e.quick'), <input id={`${id}-qa`} className="a2-inp" value={quick} maxLength={300} lang={locale} disabled={off} onChange={(e) => touch(setQuick)(e.target.value)} data-testid="jr-quick" />)}
          {fld(
            'bd',
            c('e.body'),
            <textarea id={`${id}-bd`} className="a2-inp jr-text" value={body} maxLength={100_000} lang={locale} disabled={off} aria-describedby={`${id}-bd-h`} onChange={(e) => touch(setBody)(e.target.value)} data-testid="jr-body" />,
            c('e.bodyHelp'),
          )}
          <p className="a2-xs a2-mute" data-testid="jr-count">
            {c('e.count', { words, min: minutes })}
          </p>
          <div className="a2-swl">
            <span id={`${id}-ft`}>{c('e.featured')}</span>
            <button type="button" className={`a2-sw${featured ? ' on' : ''}`} role="switch" aria-checked={featured} aria-labelledby={`${id}-ft`} disabled={off} onClick={() => touch(setFeatured)(!featured)} data-testid="jr-featured" />
          </div>
          <div className="a2-mt12">
            <button type="button" className="a2-btn pri" disabled={off || !dirty} onClick={save} data-testid="jr-save">
              {busy ? c('e.saving') : c('e.save')}
            </button>
          </div>
          {said ? (
            <p className={`a2-sm jr-said${said.bad ? ' a2-bad' : ''}`} role="status" data-testid="jr-said">
              {said.text}
            </p>
          ) : null}
        </section>

        <section className="a2-card a2-sc" aria-labelledby={`${id}-pv`}>
          <div className="jr-row">
            <h2 className="a2-h3" id={`${id}-pv`}>
              {c('e.preview')}
            </h2>
            <button type="button" className="a2-btn jr-toggle" aria-expanded={preview} onClick={() => setPreview(!preview)} data-testid="jr-preview-toggle">
              {preview ? c('e.previewOff') : c('e.previewOn')}
            </button>
          </div>
          {preview ? (
            <div className="jr-preview lm-island a2-mt12" lang={locale} data-testid="jr-preview">
              <h1>{title}</h1>
              {quick ? <p className="jr-answer">{quick}</p> : null}
              <ArticleBody body={body} boxWords={{ tip: c('e.tip'), note: c('e.note') }} products={<div className="jr-prods">{c('e.productsHere', { n: picked.length })}</div>} />
            </div>
          ) : null}
        </section>
      </div>

      <div className="jr-stack">
        {pg.id ? (
          <section className="a2-card a2-sc" aria-labelledby={`${id}-st`} data-testid="jr-steps">
            <h2 className="a2-h3" id={`${id}-st`}>
              {c('e.steps')}
            </h2>
            <p className="a2-sm">
              <span className="a2-pill">{c('e.stateNow', { state: c(`state.${pg.status}`) })}</span>
            </p>
            {pg.live ? <p className="a2-sm">{c('e.liveNow')}</p> : null}
            {pg.gaps.length ? <p className="a2-sm a2-mute">{c('e.gaps', { fields: fieldWords(pg.gaps) })}</p> : null}
            {steps.includes('schedule') ? fld('wh', c('e.when'), <input id={`${id}-wh`} className="a2-inp" type="datetime-local" value={when} disabled={busy} onChange={(e) => setWhen(e.target.value)} data-testid="jr-when" />) : null}
            {steps.includes('pass') || steps.includes('back') ? fld('nt', c('e.noteF'), <input id={`${id}-nt`} className="a2-inp" value={note} maxLength={1000} disabled={busy} onChange={(e) => setNote(e.target.value)} />) : null}
            <div className="jr-steps a2-mt12">
              {steps.map((s) => (
                <button key={s} type="button" className={`a2-btn${s === 'publish' || s === 'pass' ? ' pri' : ''}`} disabled={busy} onClick={() => step(s)} data-testid={`jr-step-${s}`}>
                  {ask === s ? c('e.confirm') : stepLabel(s)}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="a2-card a2-sc" aria-labelledby={`${id}-se`}>
          <h2 className="a2-h3" id={`${id}-se`}>
            {c('e.seo')}
          </h2>
          {fld('mt', c('e.meta'), <textarea id={`${id}-mt`} className="a2-inp" value={meta} maxLength={200} lang={locale} disabled={off} onChange={(e) => touch(setMeta)(e.target.value)} />)}
          {fld('kw', c('e.keyword'), <input id={`${id}-kw`} className="a2-inp" value={keyword} maxLength={80} lang={locale} disabled={off} onChange={(e) => touch(setKeyword)(e.target.value)} />)}
        </section>

        <section className="a2-card a2-sc" aria-labelledby={`${id}-pr`}>
          <h2 className="a2-h3" id={`${id}-pr`}>
            {c('e.products')}
          </h2>
          {fld(
            'pa',
            c('e.productAdd'),
            <select
              id={`${id}-pa`}
              className="a2-sel"
              value=""
              disabled={off || productIds.length >= 8}
              onChange={(e) => {
                if (e.target.value && !productIds.includes(e.target.value)) touch(setProductIds)([...productIds, e.target.value]);
              }}
              data-testid="jr-product-add"
            >
              <option value="">{c('e.productAdd')}</option>
              {p.products
                .filter((x) => !productIds.includes(x.id))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.onSale ? x.name : `${x.name} (${c('e.productOff')})`}
                  </option>
                ))}
            </select>,
          )}
          <ul className="jr-chips" data-testid="jr-products">
            {picked.map((x) => (
              <li key={x.id} className="jr-chip">
                {x.name}
                <button type="button" aria-label={c('e.remove', { name: x.name })} disabled={off} onClick={() => touch(setProductIds)(productIds.filter((y) => y !== x.id))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>

        {pg.id ? (
          <section className="a2-card a2-sc" aria-labelledby={`${id}-hi`} data-testid="jr-history">
            <h2 className="a2-h3" id={`${id}-hi`}>
              {c('e.history')}
            </h2>
            {pg.reviews.length ? (
              <ul className="jr-hist">
                {pg.reviews.map((r, i) => (
                  <li key={i}>
                    <b>{c(`e.stage.${r.stage}`)}</b> · {c('e.by', { who: r.reviewer ?? c('e.someone'), at: at(r.at) })}
                    {r.notes ? <div className="a2-mute">{r.notes}</div> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute">{c('e.historyNone')}</p>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
