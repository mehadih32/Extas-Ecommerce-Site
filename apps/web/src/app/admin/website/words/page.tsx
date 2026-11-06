// S02 · PR 78 (register "Label dictionary — every visible word editable by the owner, in both languages"; BACKEND-
// ARCHITECTURE WEB-05 Words & language) — Website › Words & language at /admin/website/words (?q=, ?where=, ?show=
// all | changed | untranslated, ?p=): every word the shop shows with the owner's own in English and Bengali, searched,
// filtered by place, paged; each row's "Change" fold saves that word (empty = the shop's word back), and the file card
// downloads every word as CSV and brings an edited file back. Seeing needs `website.read`; saving `website.words.write`
// (the API checks again; audited). lib/website/words.ts, lib/website/words-admin.ts, components/admin/website/
// WordsEditor.tsx. Guide: docs/admin-guide/pages/website/words.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { WordsEditor, type WordsEditorWords } from '@/components/admin/website/WordsEditor';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { WORD_GROUPS, WORD_KEYS, WORD_SHOWS } from '@/lib/website/words';
import { wordQueryOf, wordsView } from '@/lib/website/words-admin';
import bn from '../../../../../messages/admin-words.bn.json';
import en from '../../../../../messages/admin-words.en.json';
import '../../settings-cards.css';
import './words.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/words';
const KEY = 'websiteWords';
const API = '/api/admin/website/dictionary';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'wd.metaTitle'), robots: { index: false, follow: false } };
}

export default async function WordsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, raw] = await Promise.all([adminView(deps), pageAccess('website.read', deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  const sp = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])));
  const here = sp.size ? `${HERE}?${sp.toString()}` : HERE;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="website.read" />
      </div>
    );
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `wd.${k}`, vars);
  const query = wordQueryOf(sp);
  const v = await wordsView({ db: access.deps.db, resolver: access.deps.resolver }, query);
  const canEdit = access.guard.permissions?.has('website.words.write') ?? false;
  const where = Object.fromEntries(WORD_GROUPS.map((k) => [k, t(d, `wd.grp.${k}`) === `wd.grp.${k}` ? k : t(d, `wd.grp.${k}`)]));
  const errKeys = ['INVALID_INPUT', 'STALE', 'CSV_SYNTAX', 'CSV_COLUMNS', 'CSV_KEYS', 'forbidden', 'unauthorized', 'network', 'other'];
  const w: WordsEditorWords = {
    en: g('en'),
    bn: g('bn'),
    shopWord: g('shopWord'),
    yours: g('yours'),
    changed: g('changed'),
    untr: g('untr'),
    change: g('change'),
    ownEn: g('ownEn'),
    ownBn: g('ownBn'),
    emptyHelp: g('emptyHelp'),
    slotsHelp: g('slotsHelp'),
    save: g('save'),
    saving: g('saving'),
    saved: g('saved'),
    back: g('back'),
    backDone: g('backDone'),
    err: Object.fromEntries(errKeys.map((k) => [k, g(`err.${k}`)])),
  };
  const pageHref = (p: number) => {
    const next = new URLSearchParams(sp);
    if (p > 1) next.set('p', String(p));
    else next.delete('p');
    return next.size ? `${HERE}?${next.toString()}` : HERE;
  };
  const filtered = !!(query.q || query.group || query.show !== 'all');

  return (
    <div className="a2-z" data-testid="wd-page">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note a2-mt12" role="note">
        <span>{g('note')}</span>
      </div>
      <p className="a2-xs a2-mute wdb-mt6" data-testid="wd-summary">
        {g('summary', { total: WORD_KEYS.length, changed: v.changed, untr: v.untranslated })}
      </p>
      <form className="a2-sc a2-mt12 wdb-search" method="get" action={HERE} role="search" data-testid="wd-search">
        <div className="a2-fld wdb-q">
          <label className="a2-lbl" htmlFor="wd-q">
            {g('search')}
          </label>
          <input id="wd-q" className="a2-inp" type="search" name="q" defaultValue={query.q} placeholder={g('searchPh')} maxLength={120} data-testid="wd-q" />
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor="wd-where">
            {g('where')}
          </label>
          <select id="wd-where" className="a2-sel" name="where" defaultValue={query.group} data-testid="wd-where">
            <option value="">{g('everywhere')}</option>
            {WORD_GROUPS.map((k) => (
              <option key={k} value={k}>
                {where[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor="wd-show">
            {g('show')}
          </label>
          <select id="wd-show" className="a2-sel" name="show" defaultValue={query.show} data-testid="wd-show">
            {WORD_SHOWS.map((k) => (
              <option key={k} value={k}>
                {g(`showOpt.${k}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="wdb-bar wdb-go">
          <button type="submit" className="a2-btn pri" data-testid="wd-find">
            {g('find')}
          </button>
          {filtered ? (
            <a className="a2-btn" href={HERE} data-testid="wd-clear">
              {g('clear')}
            </a>
          ) : null}
        </div>
      </form>
      <WordsEditor
        head={
          <>
            <h2 className="a2-h3" id="wd-h">
              {g('found', { n: v.total })}
            </h2>
            {!canEdit ? <p className="a2-xs a2-mute wdb-mt6">{g('readOnly')}</p> : null}
            {v.total ? null : (
              <p className="a2-sm wdb-mt6" data-testid="wd-none">
                {g('none')}
              </p>
            )}
          </>
        }
        rows={v.rows}
        version={v.version}
        canEdit={canEdit}
        where={where}
        w={w}
        file={{
          title: g('file'),
          sub: g('fileSub'),
          exportHref: `${API}?format=csv`,
          exportLabel: g('export'),
          importLabel: g('import'),
          importPick: g('importPick'),
          importGo: g('importGo'),
          importing: g('importing'),
          imported: g('imported'),
          importNone: g('importNone'),
        }}
      >
        {v.pages > 1 ? (
          <nav className="wdb-pager" aria-label={g('page', { p: v.p, pages: v.pages })} data-testid="wd-pager">
            {v.p > 1 ? (
              <a className="a2-btn" href={pageHref(v.p - 1)} rel="prev" data-testid="wd-prev">
                {g('prev')}
              </a>
            ) : null}
            <span className="a2-xs a2-mute">{g('page', { p: v.p, pages: v.pages })}</span>
            {v.p < v.pages ? (
              <a className="a2-btn" href={pageHref(v.p + 1)} rel="next" data-testid="wd-next">
                {g('next')}
              </a>
            ) : null}
          </nav>
        ) : null}
      </WordsEditor>
    </div>
  );
}
