// S18 · PR 387 (Blueprint B7.5, §5 HLP-01; CN-014, CN-019 (3), CN-026) — Help & Build › Site manual at
// /admin/help/manual: the whole admin as one book for a new owner or a new team member. The contents list every section
// the person sees, in the sidebar's order, as a chapter with its pages; a chapter (`?c=<section>`) shows the section's
// overview and every page guide of it in the six parts (What · Why · How · every button and field · common mistakes ·
// what happens next), each with "Open this page" where the person may open it. The text is the same as the guide panel's
// (docs/admin-guide/pages/, read from the server's copy of the docs: lib/admin-shell/manual.ts), so a new page brings
// its chapter page with it. Reading needs `help.read` (everyone). Guide: docs/admin-guide/pages/help/site-manual.md.
// PR 388: a page's picture with numbered marks, from the latest smoke run (lib/admin-shell/shots.ts).
// PR 389: the search box (`?q=`: every word in a guide of a section the person sees, best first, each hit linking to its
// place) and "What's new" (`?new=1`: the newest built PRs with their plain line; lib/admin-shell/manual-search.ts).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ManualChapter, type ManualChapterPage } from '@/components/admin/help/ManualChapter';
import { PageHead, SectionTabs, ShellState, shellViewer } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { manualAnchor, manualOutline, readChapter } from '@/lib/admin-shell/manual';
import { queryWords, readWhatsNew, SEARCH_MIN_CHARS, searchManual } from '@/lib/admin-shell/manual-search';
import { locateKey } from '@/lib/admin-shell/sections';
import { readShots } from '@/lib/admin-shell/shots';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-manual.bn.json';
import en from '../../../../../messages/admin-manual.en.json';
import './manual.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/help/manual';
const KEY = 'manual';
// hardcode-ok: the longest search text read from the address (a technical bound)
const Q_MAX = 100;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'man.metaTitle'), robots: { index: false, follow: false } };
}

type Props = { searchParams: Promise<{ c?: string; q?: string; new?: string }> };

export default async function ManualPage(props: Props) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('help.read', deps), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="help.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `man.${k}`, vars);
  const secName = (id: string) => t(d, `shell.sec.${id}`);
  const viewer = await shellViewer();
  const outline = await manualOutline(viewer);
  const here = locateKey(KEY);
  const q = (typeof sp.q === 'string' ? sp.q : '').trim().slice(0, Q_MAX);
  const mode: 'search' | 'new' | 'chapter' = q ? 'search' : sp.new === '1' ? 'new' : 'chapter';
  const head = (
    <>
      <PageHead view={view} place={here} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />
    </>
  );
  if (!outline.length)
    return (
      <div className="a2-z" data-testid="manual">
        {head}
        <p className="a2-card" data-testid="manual-nodocs">
          {s('noDocs')}
        </p>
      </div>
    );
  const found = outline.findIndex((c) => c.section === sp.c);
  const index = Math.max(0, found);
  const active = mode === 'chapter' ? index : -1;
  const tt = (k: string) => t(d, `shell.guide.${k}`);

  let main: ReactNode;
  if (mode === 'search') {
    const words = queryWords(q);
    const hits = words.length ? await searchManual(q, viewer) : [];
    main = (
      <section className="a2-card a2-man-sec" data-testid="manual-results">
        <h2>{words.length ? s('found', { n: hits.length, q }) : s('tooShort', { n: SEARCH_MIN_CHARS })}</h2>
        {words.length && !hits.length ? <p className="a2-man-none">{s('nothing')}</p> : null}
        {hits.length ? (
          <ol className="a2-man-hits">
            {hits.map((h) => (
              <li key={h.id} data-testid="manual-hit" data-page={h.id}>
                <Link href={`${HERE}?c=${h.section}#${h.anchor}`}>
                  <b>{h.title}</b>
                  <i>{secName(h.section)}</i>
                </Link>
                <p>{h.snippet}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    );
  } else if (mode === 'new') {
    const items = await readWhatsNew(view.lang === 'bn' ? 'bn' : 'en');
    const day = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
    main = (
      <section className="a2-card a2-man-sec" data-testid="manual-new">
        <h2>{s('newH')}</h2>
        <p className="a2-man-note">{s('newSub')}</p>
        {items.length ? (
          <ol className="a2-man-new">
            {items.map((it) => (
              <li key={it.pr} data-testid="manual-new-item">
                <span className="a2-man-nd">{day(it.date)}</span>
                <span className="a2-pill line">{s('pr', { n: it.pr })}</span>
                <span className="a2-man-nt">{it.text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="a2-man-none">{s('newNone')}</p>
        )}
      </section>
    );
  } else {
    const current = outline[index]!;
    const [chapter, book] = await Promise.all([readChapter(current.section, viewer), readShots()]);
    const pages: ManualChapterPage[] = (chapter?.pages ?? []).map((p) => ({ id: p.id, anchor: manualAnchor(p.id), href: p.href, guide: chapter!.guides[p.id]!, shots: book.byGuide[p.id] ?? [] }));
    const prev = outline[index - 1];
    const next = outline[index + 1];
    main = (
      <>
        <div className="a2-man-chh">
          <span className="a2-pill line">{s('chapter', { n: index + 1 })}</span>
          <h2 data-testid="manual-chapter-title">{secName(current.section)}</h2>
          {chapter?.overviewTitle ? <p>{chapter.overviewTitle}</p> : null}
        </div>
        <ManualChapter
          base={HERE}
          section={current.section}
          sectionName={secName(current.section)}
          overview={chapter?.overview ?? null}
          pages={pages}
          texts={{ about: s('about'), open: s('open'), top: s('top'), shot: s('shot'), taken: book.at ? s('taken', { at: book.at }) : null, boxes: { tip: tt('box.tip'), careful: tt('box.careful'), example: tt('box.example') } }}
        />
        {!pages.length ? <p className="a2-card a2-man-none">{s('noGuide')}</p> : null}
        <div className="a2-man-pn">
          {prev ? (
            <Link className="a2-btn" href={`${HERE}?c=${prev.section}`} data-testid="manual-prev">
              ← {s('prev')}: {secName(prev.section)}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link className="a2-btn" href={`${HERE}?c=${next.section}`} data-testid="manual-next">
              {s('next')}: {secName(next.section)} →
            </Link>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <div className="a2-z" data-testid="manual">
      {head}
      <form className="a2-card a2-man-find" role="search" action={HERE} method="get" data-testid="manual-search">
        <label className="a2-sr" htmlFor="man-q">
          {s('searchLabel')}
        </label>
        <input id="man-q" className="a2-inp" type="search" name="q" defaultValue={q} maxLength={Q_MAX} placeholder={s('searchPh')} data-testid="manual-q" />
        <button className="a2-btn pri" type="submit">
          {s('searchGo')}
        </button>
        <Link className={`a2-btn${mode === 'new' ? ' on' : ''}`} href={`${HERE}?new=1`} data-testid="manual-new-link" aria-current={mode === 'new' ? 'page' : undefined}>
          {s('newH')}
        </Link>
      </form>
      <div className="a2-man" id="man-top">
        <nav className="a2-card a2-man-toc" aria-label={s('contents')} data-testid="manual-toc">
          {/* On a computer the contents stay beside the chapter; on a phone or tablet they fold above it, open only
              before a chapter is chosen, so the chapter is the first thing after the tabs. */}
          <b className="a2-man-tocd">{s('contents')}</b>
          <details className="a2-man-tocm" open={!sp.c && mode === 'chapter'}>
            <summary>{s('contents')}</summary>
          </details>
          <div className="a2-man-tocl">
            <ol>
              {outline.map((c, i) => (
                <li key={c.section} className={i === active ? 'on' : undefined}>
                  <Link href={`${HERE}?c=${c.section}`} aria-current={i === active ? 'page' : undefined} data-testid="manual-chapter-link" data-section={c.section}>
                    <span className="n">{i + 1}</span>
                    <span className="a2-man-tt">
                      <b>{secName(c.section)}</b>
                      <i>{s('pages', { n: c.pages.length })}</i>
                    </span>
                  </Link>
                  {i === active && c.pages.length ? (
                    <ul>
                      {c.pages.map((p) => (
                        <li key={p.id}>
                          <a href={`#${manualAnchor(p.id)}`}>{p.title}</a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </nav>
        <div className="a2-man-main">{main}</div>
      </div>
    </div>
  );
}
