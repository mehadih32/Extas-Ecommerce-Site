// S18 · PR 387 (Blueprint B7.5, §5 HLP-01; CN-014, CN-019 (3), CN-026) — Help & Build › Site manual at
// /admin/help/manual: the whole admin as one book for a new owner or a new team member. The contents list every section
// the person sees, in the sidebar's order, as a chapter with its pages; a chapter (`?c=<section>`) shows the section's
// overview and every page guide of it in the six parts (What · Why · How · every button and field · common mistakes ·
// what happens next), each with "Open this page" where the person may open it. The text is the same as the guide panel's
// (docs/admin-guide/pages/, read from the server's copy of the docs: lib/admin-shell/manual.ts), so a new page brings
// its chapter page with it. Reading needs `help.read` (everyone). Guide: docs/admin-guide/pages/help/site-manual.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ManualChapter, type ManualChapterPage } from '@/components/admin/help/ManualChapter';
import { PageHead, SectionTabs, ShellState, shellViewer } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { manualAnchor, manualOutline, readChapter } from '@/lib/admin-shell/manual';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-manual.bn.json';
import en from '../../../../../messages/admin-manual.en.json';
import './manual.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/help/manual';
const KEY = 'manual';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'man.metaTitle'), robots: { index: false, follow: false } };
}

type Props = { searchParams: Promise<{ c?: string }> };

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
  const index = Math.max(
    0,
    outline.findIndex((c) => c.section === sp.c),
  );
  const current = outline[index]!;
  const chapter = await readChapter(current.section, viewer);
  const pages: ManualChapterPage[] = (chapter?.pages ?? []).map((p) => ({ id: p.id, anchor: manualAnchor(p.id), href: p.href, guide: chapter!.guides[p.id]! }));
  const prev = outline[index - 1];
  const next = outline[index + 1];
  const tt = (k: string) => t(d, `shell.guide.${k}`);

  return (
    <div className="a2-z" data-testid="manual">
      {head}
      <div className="a2-man" id="man-top">
        <nav className="a2-card a2-man-toc" aria-label={s('contents')} data-testid="manual-toc">
          {/* On a computer the contents stay beside the chapter; on a phone or tablet they fold above it, open only
              before a chapter is chosen, so the chapter is the first thing after the tabs. */}
          <b className="a2-man-tocd">{s('contents')}</b>
          <details className="a2-man-tocm" open={!sp.c}>
            <summary>{s('contents')}</summary>
          </details>
          <div className="a2-man-tocl">
            <ol>
              {outline.map((c, i) => (
                <li key={c.section} className={i === index ? 'on' : undefined}>
                  <Link href={`${HERE}?c=${c.section}`} aria-current={i === index ? 'page' : undefined} data-testid="manual-chapter-link" data-section={c.section}>
                    <span className="n">{i + 1}</span>
                    <span className="a2-man-tt">
                      <b>{secName(c.section)}</b>
                      <i>{s('pages', { n: c.pages.length })}</i>
                    </span>
                  </Link>
                  {i === index && c.pages.length ? (
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
        <div className="a2-man-main">
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
            texts={{ about: s('about'), open: s('open'), top: s('top'), boxes: { tip: tt('box.tip'), careful: tt('box.careful'), example: tt('box.example') } }}
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
        </div>
      </div>
    </div>
  );
}
