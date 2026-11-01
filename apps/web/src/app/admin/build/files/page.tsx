// S21 · PR 594 (§5 HLP-02, CN-011) — Help & Build › Blueprint & files at /admin/build/files: the blueprint, the master
// register and every supporting Markdown file as the last deploy copied them to the server (lib/build-files.ts): the
// core files and the other top-level files first, then one row per folder (?dir= opens it), a search inside every file
// (most matches first), and for each file Read (one part at a time) and Download. Never the copies of other people's
// skills. Seeing it needs `build.read`. Read-only.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { docsDir } from '@/lib/build-api';
import { docFolders, folderOf, listDocs, MIN_SEARCH, searchDocs, type DocFile } from '@/lib/build-files';
import { withBuildWords } from '@/lib/build-words';
import { t } from '@/lib/i18n';
import '../build.css';

export const dynamic = 'force-dynamic';

const KEY = 'buildFiles';
const HERE = '/admin/build/files';
const API = '/api/admin/build/files';

type Search = Promise<Record<string, string | string[] | undefined>>;
const kb = (n: number) => Math.max(1, Math.round(n / 1024)); // hardcode-ok: bytes to kilobytes

export async function generateMetadata(): Promise<Metadata> {
  const view = withBuildWords(await adminView());
  return { title: `${t(view.dict, 'build.files.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function BuildFilesPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [sp, plain, access] = await Promise.all([searchParams, adminView(deps), pageAccess('build.read', deps, MOTHER_STORE_ID)]);
  const view = withBuildWords(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="build.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `build.${k}`, vars);
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 120) : ''; // hardcode-ok: the longest search kept
  const dir = docsDir();
  const files = dir ? await listDocs(dir) : [];
  const hits = dir && q.length >= MIN_SEARCH ? await searchDocs(dir, q) : null;
  const folders = docFolders(files);
  const asked = typeof sp.dir === 'string' ? sp.dir : '';
  const open = hits ? '' : (folders.find((x) => x.dir === asked)?.dir ?? '');
  const shown = open ? files.filter((f) => folderOf(f.path) === open) : files.filter((f) => !folderOf(f.path));
  const rows: { file: DocFile; count: number | null }[] = hits ? hits.map((h) => ({ file: h.file, count: h.count })) : shown.map((f) => ({ file: f, count: null }));
  const readHref = (f: DocFile) => `${HERE}/read?path=${encodeURIComponent(f.path)}${hits ? `&f=${encodeURIComponent(q)}` : ''}`;

  return (
    <div className="a2-z" data-testid="bf-page">
      <PageHead view={view} place={locateKey(KEY)} title={c('files.title')} sub={c('files.sub')} />
      <SectionTabs view={view} current={KEY} />

      {!files.length ? (
        <section className="a2-card a2-mt12">
          <p className="a2-sm a2-mute" data-testid="bf-nodocs">
            {c('files.noDocs')}
          </p>
        </section>
      ) : (
        <>
          <section className="a2-card a2-mt12" aria-label={c('files.search')}>
            <form className="bd-filter" action={HERE} method="get" data-testid="bf-search">
              <label className="a2-fsrch">
                <span className="a2-sr">{c('files.search')}</span>
                <ShellIcon name="search" size={16} />
                <input className="a2-inp" type="search" name="q" defaultValue={q} placeholder={c('files.searchPh')} autoComplete="off" data-testid="bf-q" />
              </label>
              <button type="submit" className="a2-btn pri" data-testid="bf-go">
                {c('files.go')}
              </button>
              {q ? (
                <Link className="a2-btn" href={HERE}>
                  {c('files.clear')}
                </Link>
              ) : null}
            </form>
            {q && q.length < MIN_SEARCH ? <p className="a2-xs a2-mute a2-mt6">{c('files.short', { n: MIN_SEARCH })}</p> : null}
          </section>

          <section className="a2-card a2-mt12" aria-labelledby="bf-list-h" data-testid="bf-list" data-n={rows.length} data-dir={open}>
            {open ? (
              <Link className="bd-crumb" href={HERE} data-testid="bf-up">
                <ShellIcon name="cl" size={12} />
                {c('files.allFolders')}
              </Link>
            ) : null}
            <h2 className="a2-h3" id="bf-list-h">
              {hits ? c('files.hits', { n: rows.length, q }) : open ? c('files.inFolder', { dir: open, n: rows.length }) : c('files.count', { n: files.length })}
            </h2>
            {rows.length ? (
              <ul className="bd-rows">
                {rows.map(({ file: f, count }) => (
                  <li key={f.path} className="bd-row" data-testid="bf-file" data-path={f.path}>
                    <span className="bd-main">
                      <Link href={readHref(f)}>{f.title}</Link>
                    </span>
                    {f.core ? <span className="a2-pill g">{c('files.core')}</span> : <span />}
                    <span className="bd-sub a2-xs a2-mute">
                      <span>{f.path}</span>
                      <span>{c('files.size', { kb: kb(f.size) })}</span>
                      {count !== null ? <b>{count ? c('files.hit', { n: count }) : c('files.nameHit')}</b> : <span className="a2-mono">{f.hash}</span>}
                      <Link className="a2-lnk" href={readHref(f)}>
                        {c('files.read')}
                      </Link>
                      <a className="a2-lnk" href={`${API}?path=${encodeURIComponent(f.path)}`} download data-testid="bf-dl">
                        {c('files.download')}
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute a2-mt6" data-testid="bf-none">
                {c('files.none', { q })}
              </p>
            )}
            {!hits && !open && folders.length ? (
              <>
                <h3 className="a2-h3 a2-mt12">{c('files.folders')}</h3>
                <ul className="bd-rows" data-testid="bf-folders">
                  {folders.map((x) => (
                    <li key={x.dir} className="bd-row" data-testid="bf-folder" data-dir={x.dir}>
                      <span className="bd-main">
                        <Link href={`${HERE}?dir=${encodeURIComponent(x.dir)}`}>{x.dir}/</Link>
                      </span>
                      <span />
                      <span className="bd-sub a2-xs a2-mute">
                        <span>{c('files.folderCount', { n: x.count })}</span>
                        <span>{c('files.size', { kb: kb(x.size) })}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
          <p className="a2-xs a2-mute a2-mt12">{c('files.backup')}</p>
        </>
      )}
    </div>
  );
}
