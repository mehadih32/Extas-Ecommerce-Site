'use client';
// S12 · PR 240 (Blueprint C11.3, C11.4) — the journal's categories (a main category and its sub-categories) or its
// authors (an AI author always labelled as one): the list with each one's articles, "Add", "Edit", "Put away" and
// "Restore" (never deleted). Every save sends the version it was read at. Without `blog.write` it is read-only.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import type { AuthorView, CategoryView } from '@/lib/journal/journal';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

type Kind = 'categories' | 'authors';
type Row = CategoryView | AuthorView;
type Draft = Record<string, string | boolean>;

const blankCat: Draft = { slug: '', nameEn: '', nameBn: '', introEn: '', introBn: '', parentId: '', sortOrder: '0' };
const blankAuthor: Draft = { slug: '', displayName: '', isAiAuthor: false, bioEn: '', bioBn: '', reviewerLine: '' };
const draftOf = (kind: Kind, r: Row | null): Draft => {
  if (!r) return kind === 'categories' ? { ...blankCat } : { ...blankAuthor };
  if (kind === 'categories') {
    const c = r as CategoryView;
    return { slug: c.slug, nameEn: c.nameEn, nameBn: c.nameBn ?? '', introEn: c.introEn ?? '', introBn: c.introBn ?? '', parentId: c.parentId ?? '', sortOrder: String(c.sortOrder) };
  }
  const a = r as AuthorView;
  return { slug: a.slug, displayName: a.displayName, isAiAuthor: a.isAiAuthor, bioEn: a.bioEn ?? '', bioBn: a.bioBn ?? '', reviewerLine: a.reviewerLine ?? '' };
};

export function JournalShelf(p: { kind: Kind; words: Dict; rows: Row[]; canWrite: boolean; lang: 'en' | 'bn' }) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.words, `jr.${k}`, vars);
  const [open, setOpen] = useState<string | null>(null); // a row's id, 'new', or null
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const api = `/api/admin/blog/${p.kind}`;
  const isCat = p.kind === 'categories';
  const mains = isCat ? (p.rows as CategoryView[]).filter((r) => !r.parentId && !r.archived) : [];
  const ordered = isCat ? (p.rows as CategoryView[]).filter((r) => !r.parentId).flatMap((m) => [m, ...(p.rows as CategoryView[]).filter((r) => r.parentId === m.id)]) : p.rows;

  function errText(a: { status: number; data: { error?: string; details?: string[] } }) {
    if (a.status === 0) return c('err.network');
    const k = `err.${a.data.error ?? 'other'}`;
    const txt = c(k, { fields: (a.data.details ?? []).map((f) => c(`sh.${f === 'parentId' ? 'parent' : f}`)).join(', ') });
    return txt === `jr.${k}` ? c('err.other') : txt;
  }

  async function send(method: 'POST' | 'PUT', url: string, body: unknown) {
    setBusy(true);
    const a = await call(method, url, body);
    setBusy(false);
    if (a.status === 200 || a.status === 201) {
      setOpen(null);
      showToast({ text: c('e.saved'), tone: 'ok' });
      return router.refresh();
    }
    setSaid({ text: errText(a), bad: true });
    if (a.status === 409 && a.data.error === 'STALE') router.refresh();
  }

  function save(row: Row | null) {
    const d = draft;
    const body = isCat
      ? { slug: d.slug, nameEn: d.nameEn, nameBn: d.nameBn, introEn: d.introEn, introBn: d.introBn, parentId: d.parentId || null, sortOrder: Number(d.sortOrder) || 0 }
      : { slug: d.slug, displayName: d.displayName, isAiAuthor: d.isAiAuthor === true, bioEn: d.bioEn, bioBn: d.bioBn, reviewerLine: d.reviewerLine };
    return send(row ? 'PUT' : 'POST', row ? `${api}/${row.id}` : api, row ? { ...body, version: row.version } : body);
  }

  const txt = (k: string, max: number, lang?: string, area = false) => {
    const fid = `${id}-${open}-${k}`;
    const v = String(draft[k] ?? '');
    const on = (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });
    return (
      <div className="a2-fld" key={k}>
        <label className="a2-lbl" htmlFor={fid}>
          {c(`sh.${k === 'reviewerLine' ? 'reviewer' : k}`)}
        </label>
        {area ? <textarea id={fid} className="a2-inp" value={v} maxLength={max} lang={lang} disabled={busy} onChange={on} /> : <input id={fid} className={`a2-inp${k === 'slug' ? ' a2-mono' : ''}`} value={v} maxLength={max} lang={lang} disabled={busy} onChange={on} data-testid={`jr-sh-${k}`} />}
      </div>
    );
  };

  const form = (row: Row | null) => (
    <div className="jr-form" data-testid="jr-sh-form">
      <div className="jr-g2">
        {txt(isCat ? 'nameEn' : 'displayName', 80)}
        {isCat ? txt('nameBn', 80, 'bn') : null}
        {txt('slug', 80)}
        {isCat ? (
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-${open}-parent`}>
              {c('sh.parent')}
            </label>
            <select id={`${id}-${open}-parent`} className="a2-sel" value={String(draft.parentId ?? '')} disabled={busy} onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}>
              <option value="">{c('sh.parentNone')}</option>
              {mains
                .filter((m) => m.id !== row?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {p.lang === 'bn' && m.nameBn ? m.nameBn : m.nameEn}
                  </option>
                ))}
            </select>
          </div>
        ) : null}
      </div>
      {isCat ? (
        <>
          {txt('introEn', 600, 'en', true)}
          {txt('introBn', 600, 'bn', true)}
        </>
      ) : (
        <>
          <div className="a2-swl">
            <span id={`${id}-${open}-ai`}>{c('sh.isAi')}</span>
            <button type="button" className={`a2-sw${draft.isAiAuthor ? ' on' : ''}`} role="switch" aria-checked={draft.isAiAuthor === true} aria-labelledby={`${id}-${open}-ai`} disabled={busy} onClick={() => setDraft({ ...draft, isAiAuthor: !draft.isAiAuthor })} data-testid="jr-sh-ai" />
          </div>
          {txt('bioEn', 600, 'en', true)}
          {txt('bioBn', 600, 'bn', true)}
          {txt('reviewerLine', 120)}
        </>
      )}
      <div className="jr-row">
        <button type="button" className="a2-btn pri" disabled={busy} onClick={() => save(row)} data-testid="jr-sh-save">
          {c('sh.save')}
        </button>
        <button type="button" className="a2-btn" disabled={busy} onClick={() => setOpen(null)}>
          {c('sh.cancel')}
        </button>
      </div>
    </div>
  );

  const label = (r: Row) => (isCat ? (p.lang === 'bn' && (r as CategoryView).nameBn) || (r as CategoryView).nameEn : (r as AuthorView).displayName);

  return (
    <div>
      {p.canWrite && open !== 'new' ? (
        <button
          type="button"
          className="a2-btn a2-mt12"
          disabled={busy}
          onClick={() => {
            setDraft(draftOf(p.kind, null));
            setOpen('new');
            setSaid(null);
          }}
          data-testid={`jr-sh-add-${p.kind}`}
        >
          {c('sh.add')}
        </button>
      ) : null}
      {open === 'new' ? form(null) : null}
      {said ? (
        <p className={`a2-sm jr-said${said.bad ? ' a2-bad' : ''}`} role="status">
          {said.text}
        </p>
      ) : null}
      {ordered.length ? (
        <ul className="jr-shelf" data-testid={`jr-sh-${p.kind}`}>
          {ordered.map((r) => (
            <li key={r.id} className={isCat && (r as CategoryView).parentId ? 'sub' : undefined}>
              <div className="jr-row">
                <div>
                  <b>{label(r)}</b> <span className="a2-mono a2-xs a2-mute">{r.slug}</span>
                  {!isCat && (r as AuthorView).agentKey ? (
                    <span className="a2-mono a2-xs a2-mute" title={c('sh.agentKeyTip')}>
                      {' '}
                      · {(r as AuthorView).agentKey}
                    </span>
                  ) : null}
                  <div className="a2-xs a2-mute">
                    {!isCat ? <span className="a2-pill">{(r as AuthorView).isAiAuthor ? c('sh.aiPill') : c('sh.personPill')}</span> : null} {c('sh.posts', { n: r.posts })}
                    {r.archived ? ` · ${c('sh.archived')}` : ''}
                  </div>
                </div>
                {p.canWrite ? (
                  <div className="jr-steps">
                    {!r.archived ? (
                      <button
                        type="button"
                        className="a2-btn"
                        disabled={busy}
                        onClick={() => {
                          setDraft(draftOf(p.kind, r));
                          setOpen(r.id);
                          setSaid(null);
                        }}
                      >
                        {c('sh.edit')}
                      </button>
                    ) : null}
                    <button type="button" className="a2-btn" disabled={busy} onClick={() => send('POST', `${api}/${r.id}`, { action: r.archived ? 'restore' : 'archive', version: r.version })}>
                      {r.archived ? c('sh.restore') : c('sh.archive')}
                    </button>
                  </div>
                ) : null}
              </div>
              {open === r.id ? form(r) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="a2-sm a2-mute a2-mt12">{c('sh.empty')}</p>
      )}
    </div>
  );
}
