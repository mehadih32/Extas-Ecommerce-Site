// S21 · PR 594 (§5 HLP-02) — one docs file read inside the admin at /admin/build/files/read?path=<docs path>: the contents
// (its level-1 and level-2 headings; a very long part, such as the register's build table, in pieces of PART_LINES
// lines) beside one part at a time (the blueprint is large), drawn from its Markdown like the
// guides; "Find in this file" marks the parts with a match and highlights it; Previous / Next; Download; and the file's
// earlier versions among the copies the server keeps, each downloadable. Only a file the docs listing has is opened.
// Seeing it needs `build.read`. Read-only.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { DocBlocks } from '@/components/admin/build/DocBlocks';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { parseMarkdown } from '@/lib/admin-shell/guide';
import { locateKey } from '@/lib/admin-shell/sections';
import { docsDir } from '@/lib/build-api';
import { countIn, docSections, docVersions, MIN_SEARCH, readDoc } from '@/lib/build-files';
import { withBuildWords } from '@/lib/build-words';
import { t } from '@/lib/i18n';
import '../../build.css';

export const dynamic = 'force-dynamic';

const KEY = 'buildFile';
const HERE = '/admin/build/files/read';
const LIST = '/admin/build/files';
const API = '/api/admin/build/files';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const kb = (n: number) => Math.max(1, Math.round(n / 1024)); // hardcode-ok: bytes to kilobytes

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const [sp, plain] = await Promise.all([searchParams, adminView()]);
  const view = withBuildWords(plain);
  const name = one(sp.path).split('/').pop() || t(view.dict, 'build.files.metaTitle');
  return { title: `${name.slice(0, 80)} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function BuildFilePage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [sp, plain, access] = await Promise.all([searchParams, adminView(deps), pageAccess('build.read', deps, MOTHER_STORE_ID)]);
  const view = withBuildWords(plain);
  const path = one(sp.path).slice(0, 300); // hardcode-ok: the longest docs path read
  const here = `${HERE}?path=${encodeURIComponent(path)}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="build.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `build.${k}`, vars);
  const dir = docsDir();
  const doc = dir ? await readDoc(dir, path) : null;
  const back = (
    <Link className="bd-crumb" href={LIST} data-testid="bfr-back">
      <ShellIcon name="cl" size={12} />
      {c('files.title')}
    </Link>
  );
  if (!dir || !doc)
    return (
      <div className="a2-z" data-testid="bfr-page">
        <PageHead view={view} place={locateKey(KEY)} crumb={back} title={c('files.title')} />
        <section className="a2-card a2-mt12">
          <p className="a2-sm a2-mute" data-testid="bfr-none">
            {c('read.notFound')}
          </p>
        </section>
      </div>
    );
  const f = one(sp.f).trim().slice(0, 120); // hardcode-ok: the longest search kept
  const find = f.length >= MIN_SEARCH ? f : '';
  const parts = docSections(doc.text, c('read.start'));
  const hits = parts.map((p) => (find ? countIn(p.md, find) : 0));
  const total = hits.reduce((a, b) => a + b, 0);
  const asked = Number(one(sp.i));
  const first = hits.findIndex((h) => h > 0);
  const i = Number.isInteger(asked) && asked >= 0 && asked < parts.length && one(sp.i) !== '' ? asked : find && first >= 0 ? first : 0;
  const part = parts[i]!;
  const versions = await docVersions(dir, path);
  const boxes = { tip: t(d, 'shell.guide.box.tip'), careful: t(d, 'shell.guide.box.careful'), example: '' };
  const partHref = (k: number) => `${here}&i=${k}${find ? `&f=${encodeURIComponent(find)}` : ''}`;
  const dl = `${API}?path=${encodeURIComponent(path)}`;

  return (
    <div className="a2-z" data-testid="bfr-page" data-path={path} data-part={i}>
      <PageHead
        view={view}
        place={locateKey(KEY)}
        crumb={back}
        title={doc.file.title}
        sub={c('read.sub', { path, kb: kb(doc.file.size), n: parts.length })}
        right={
          <a className="a2-btn" href={dl} download data-testid="bfr-dl">
            <ShellIcon name="dl" size={15} />
            {c('read.download')}
          </a>
        }
      />
      <SectionTabs view={view} current={KEY} />

      <div className="bd-reader a2-mt12">
        <aside className="a2-card" aria-label={c('read.toc')}>
          <form className="bd-find" action={HERE} method="get" role="search" data-testid="bfr-find">
            <input type="hidden" name="path" value={path} />
            <label className="a2-sr" htmlFor="bfr-f">
              {c('read.find')}
            </label>
            <input id="bfr-f" className="a2-inp" type="search" name="f" defaultValue={f} placeholder={c('read.find')} autoComplete="off" data-testid="bfr-f" />
            <button type="submit" className="a2-btn">
              {c('read.findGo')}
            </button>
          </form>
          {find ? (
            <p className="a2-xs a2-mt6" role="status" data-testid="bfr-found" data-n={total}>
              {total ? c('read.found', { n: total }) : c('read.notFound2', { q: find })}
            </p>
          ) : null}
          <nav className="bd-toc" aria-label={c('read.toc')} data-testid="bfr-toc">
            {parts.map((p, k) => (
              <Link key={k} className={k === i ? 'on' : undefined} href={partHref(k)} aria-current={k === i ? 'page' : undefined} scroll={false}>
                {hits[k] ? <span className="bd-dot">●</span> : null}
                {p.title.slice(0, 90)}
              </Link>
            ))}
          </nav>
          <form className="bd-pick" action={HERE} method="get" data-testid="bfr-pick">
            <input type="hidden" name="path" value={path} />
            {find ? <input type="hidden" name="f" value={find} /> : null}
            <label className="a2-sr" htmlFor="bfr-i">
              {c('read.pick')}
            </label>
            <select id="bfr-i" className="a2-sel" name="i" defaultValue={String(i)}>
              {parts.map((p, k) => (
                <option key={k} value={k}>
                  {hits[k] ? '● ' : ''}
                  {p.title.slice(0, 60)}
                </option>
              ))}
            </select>
            <button type="submit" className="a2-btn">
              {c('filter.go')}
            </button>
          </form>
        </aside>

        <div>
          <article className="a2-card bd-doc" data-testid="bfr-part">
            <p className="a2-xs a2-mute">{c('read.part', { i: i + 1, n: parts.length })}</p>
            <div className="bd-text a2-guidebody">
              <DocBlocks blocks={parseMarkdown(part.md)} boxes={boxes} mark={find} />
            </div>
            <div className="bd-nav">
              {i > 0 ? (
                <Link className="a2-btn sm" href={partHref(i - 1)} data-testid="bfr-prev">
                  <ShellIcon name="cl" size={14} />
                  {c('read.prev')}
                </Link>
              ) : (
                <span />
              )}
              {i < parts.length - 1 ? (
                <Link className="a2-btn sm" href={partHref(i + 1)} data-testid="bfr-next">
                  {c('read.next')}
                  <ShellIcon name="cr" size={14} />
                </Link>
              ) : null}
            </div>
          </article>

          <section className="a2-card a2-mt12" aria-labelledby="bfr-ver-h" data-testid="bfr-versions" data-n={versions.length}>
            <h2 className="a2-h3" id="bfr-ver-h">
              {c('read.versions')}
            </h2>
            <p className="a2-cs">{c('read.versionsSub')}</p>
            {versions.length > 1 ? (
              <ul className="bd-rows">
                {versions.map((v) => (
                  <li key={v.id} className="bd-row" data-testid="bfr-version">
                    <span className="bd-main a2-sm">
                      <span className="a2-mono">{v.id}</span> · {v.committed ? c('read.since', { at: v.committed }) : ''}
                    </span>
                    {v.current ? <span className="a2-pill g">{c('read.current')}</span> : <span />}
                    <span className="bd-sub a2-xs a2-mute">
                      <span>{c('files.size', { kb: kb(v.size) })}</span>
                      <span className="a2-mono">{v.hash}</span>
                      <a className="a2-lnk" href={`${dl}${v.current ? '' : `&v=${v.id}`}`} download>
                        {c('read.download')}
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute a2-mt6">{c('read.noVersions')}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
