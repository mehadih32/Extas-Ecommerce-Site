// S11 · PR 588 (Blueprint C12.1) — Website › SEO › Bengali pages at /admin/website/seo/bengali: the Bengali coverage
// report (every page that could be listed: the shop's own pages, collections, products and sets; whether its main
// content has Bengali text, and whether it is marked ready), "Mark ready" / "Not ready" per page or for a whole page of
// the list, and what a Bengali page that is not ready shows (`language.bengali.gate`). A page marked ready is listed by
// search engines, named in the sitemap and given hreflang (lib/shop/meta, the sitemaps). Seeing needs `seo.read`;
// marking and the choice need `seo.manage`. Guide: docs/admin-guide/pages/website/seo-bengali.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { BENGALI_GATE_MODES } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { BengaliReadyButton } from '@/components/admin/settings/BengaliReadyButton';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { BENGALI_KINDS, BENGALI_STATES, bengaliCoverage, pickRows, type BengaliKind, type BengaliRow, type BengaliState } from '@/lib/seo/bengali';
import bn from '../../../../../../messages/admin-bengali.bn.json';
import en from '../../../../../../messages/admin-bengali.en.json';
import '../../../settings-cards.css';
import './bengali.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/seo/bengali';
const API = '/api/admin/seo/bengali';
const KEY = 'seoBengali';
/** Rows on one page of the list. */
const PAGE_SIZE = 50; // hardcode-ok: the list's page length, not a business number

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'bng.metaTitle'), robots: { index: false, follow: false } };
}

type Props = { searchParams: Promise<{ kind?: string; state?: string; page?: string }> };
const one = (v: string | undefined, list: readonly string[], dflt: string) => (v && list.includes(v) ? v : dflt);

export default async function BengaliPagesPage(props: Props) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('seo.read', deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="seo.read" />
      </div>
    );
  const cov = await bengaliCoverage({ db: access.deps.db, resolver: access.deps.resolver });
  const canManage = access.guard.permissions?.has('seo.manage') ?? false;
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `bng.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const kind = one(sp.kind, ['all', ...BENGALI_KINDS], 'all') as BengaliKind | 'all';
  const state = one(sp.state, BENGALI_STATES, 'all') as BengaliState;
  const shown = pickRows(cov.rows, kind, state);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1));
  const rows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const c = cov.counts;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const waiting = c.withBengali - cov.rows.filter((r) => r.ready && r.hasBengali).length;
  const href = (o: { kind?: string; state?: string; page?: number }) => {
    const p = new URLSearchParams();
    const k = o.kind ?? kind;
    const st = o.state ?? state;
    if (k !== 'all') p.set('kind', k);
    if (st !== 'all') p.set('state', st);
    if (o.page && o.page > 1) p.set('page', String(o.page));
    const q = p.toString();
    return q ? `${HERE}?${q}` : HERE;
  };
  const nameOf = (r: BengaliRow) => (r.kind === 'pages' || r.name === 'newIn' ? s(`page.${r.name}`) : r.name);
  const errs = Object.fromEntries(['NO_BENGALI', 'NOT_FOUND', 'STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, s(`err.${k}`)]));
  const markTexts = { label: s('mark'), working: s('working'), err: errs };
  const unmarkTexts = { label: s('unmark'), working: s('working'), err: errs };
  const bulk = rows.filter((r) => !r.ready && r.hasBengali).map((r) => r.key);

  const texts: FieldsCardTexts = {
    h: s('card.h'),
    d: s('card.d'),
    save: s('card.save'),
    saving: s('card.saving'),
    saved: s('card.saved'),
    discard: s('card.discard'),
    unsaved: s('card.unsaved'),
    readOnly: s('card.readOnly'),
    pairHelp: s('card.pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, s(`err.${k}`)])),
  };
  const fields: FieldsCardField[] = [{ kind: 'select', path: 'notReady', label: s('card.notReady'), help: s('card.notReadyHelp'), options: BENGALI_GATE_MODES.map((m) => ({ value: m, label: s(`card.${m}`) })) }];

  return (
    <div className="a2-z" data-testid="bengali-page">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      {!cov.bengaliOn ? (
        <div className="a2-note" role="note" data-testid="bengali-off">
          <span>{s('bengaliOff')}</span>
        </div>
      ) : null}

      <div className="a2-kpis a2-mt12">
        <div className="a2-card a2-kpi" data-testid="bengali-kpi-coverage">
          <div className="a2-kl">{s('kpi.coverage')}</div>
          <div className="a2-kv">{num(pct(c.ready, c.total))}%</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('kpi.coverageFoot', { ready: num(c.ready), total: num(c.total) })}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{s('kpi.withText')}</div>
          <div className="a2-kv">{num(c.withBengali)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('kpi.withTextFoot', { total: num(c.total) })}</span>
          </div>
        </div>
        <Link className="a2-card a2-kpi" href={href({ state: 'waiting', page: 1 })} data-testid="bengali-kpi-waiting">
          <div className="a2-kl">{s('kpi.waiting')}</div>
          <div className="a2-kv">{num(waiting)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('kpi.waitingFoot')}</span>
          </div>
        </Link>
        <Link className="a2-card a2-kpi" href={href({ state: 'missing', page: 1 })}>
          <div className="a2-kl">{s('kpi.missing')}</div>
          <div className="a2-kv">{num(c.total - c.withBengali)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('kpi.missingFoot')}</span>
          </div>
        </Link>
      </div>

      <section className="a2-sc a2-mt12" aria-labelledby="bg-kind-h">
        <h2 className="a2-h3" id="bg-kind-h">
          {s('byKindH')}
        </h2>
        <ul className="bg-kinds a2-mt12" data-testid="bengali-by-kind">
          {BENGALI_KINDS.map((k) => (
            <li key={k}>
              <Link href={href({ kind: k, page: 1 })} className="bg-kname">
                {s(`kind.${k}`)}
              </Link>
              <span className="bg-bar" aria-hidden="true">
                <i style={{ width: `${pct(c.byKind[k].ready, c.byKind[k].total)}%` }} />
              </span>
              <span className="a2-sm a2-mute">{s('byKindLine', { ready: num(c.byKind[k].ready), total: num(c.byKind[k].total) })}</span>
            </li>
          ))}
        </ul>
      </section>

      {cov.leftOver.length ? (
        <div className="a2-note a2-mt12" role="note" data-testid="bengali-leftover">
          <span>{s('leftOver', { n: num(cov.leftOver.length) })}</span>
        </div>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="bg-list-h">
        <h2 className="a2-h3 bg-sr" id="bg-list-h">
          {s('title')}
        </h2>
        <nav className="a2-views bg-views" aria-label={s('col.page')}>
          {(['all', ...BENGALI_KINDS] as const).map((k) => (
            <Link key={k} className={`a2-view${kind === k ? ' on' : ''}`} href={href({ kind: k, page: 1 })} aria-current={kind === k ? 'page' : undefined}>
              {s(`kind.${k}`)}
            </Link>
          ))}
        </nav>
        <nav className="a2-views bg-views" aria-label={s('col.ready')}>
          {BENGALI_STATES.map((st) => (
            <Link key={st} className={`a2-view${state === st ? ' on' : ''}`} href={href({ state: st, page: 1 })} aria-current={state === st ? 'page' : undefined} data-testid={`bengali-state-${st}`}>
              {s(`state.${st}`)}
            </Link>
          ))}
        </nav>
        {canManage && bulk.length > 1 ? (
          <div className="a2-mt12">
            <BengaliReadyButton url={API} keys={bulk} ready version={cov.ready.version} primary testId="bengali-mark-all" texts={{ ...markTexts, label: s('markAll', { n: num(bulk.length) }) }} />
          </div>
        ) : null}
        {!canManage ? <p className="a2-sm a2-mute a2-mt12">{s('noManage')}</p> : null}
        {rows.length ? (
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl" data-testid="bengali-rows">
              <thead>
                <tr>
                  <th>{s('col.page')}</th>
                  <th>{s('col.text')}</th>
                  <th>{s('col.ready')}</th>
                  {canManage ? <th>{s('col.act')}</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} data-key={r.key} data-ready={r.ready ? 'yes' : 'no'}>
                    <td className="bg-name">
                      <div className="bg-kind a2-xs a2-mute">{s(`kind.${r.kind}`)}</div>
                      <div>{nameOf(r)}</div>
                      <div className="a2-sm a2-mute bg-path">{r.path}</div>
                    </td>
                    <td className="a2-sm">
                      {r.hasBengali ? (
                        <span className="a2-pill ok">{r.kind === 'pages' || r.name === 'newIn' ? s('text.words') : s('text.ok')}</span>
                      ) : (
                        <span className="a2-pill warn">{s('text.missing', { fields: r.missing.map((f) => s(`field.${f}`)).join(', ') })}</span>
                      )}
                      {r.ready && !r.hasBengali ? <div className="a2-sm bg-err">{s('readyMissing')}</div> : null}
                    </td>
                    <td>
                      <span className={`a2-pill ${r.ready ? 'ok' : 'line'}`}>{s(r.ready ? 'ready.yes' : 'ready.no')}</span>
                    </td>
                    {canManage ? (
                      <td>
                        {r.ready ? (
                          <BengaliReadyButton url={API} keys={[r.key]} ready={false} version={cov.ready.version} testId={`bengali-unmark-${r.key}`} texts={unmarkTexts} />
                        ) : r.hasBengali ? (
                          <BengaliReadyButton url={API} keys={[r.key]} ready version={cov.ready.version} testId={`bengali-mark-${r.key}`} texts={markTexts} />
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12" data-testid="bengali-none">
            {s('none')}
          </p>
        )}
        {pages > 1 ? (
          <nav className="bg-pager a2-mt12" aria-label={s('pageOf', { page: num(page), pages: num(pages) })}>
            {page > 1 ? (
              <Link className="a2-btn" href={href({ page: page - 1 })}>
                {s('prev')}
              </Link>
            ) : null}
            <span className="a2-sm a2-mute">{s('pageOf', { page: num(page), pages: num(pages) })}</span>
            {page < pages ? (
              <Link className="a2-btn" href={href({ page: page + 1 })}>
                {s('next')}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>

      <FieldsCard url={API} screen={{ key: cov.gate.key, value: cov.gate.value, version: cov.gate.version }} fields={fields} texts={texts} canEdit={canManage} testId="bengali-gate" />
    </div>
  );
}
