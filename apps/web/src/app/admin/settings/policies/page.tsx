// S18 · PR 384 — SET-03 Settings › Policies & texts at /admin/settings/policies (docs/BACKEND-ARCHITECTURE.md §5.13):
// the help pages that carry the shop's policies. Per page: is it showing, which Smart Rules it reads (live or not),
// which store details follow it, and the owner's own words in both languages, where `{rule-key.param}` quotes a live
// rule's number. Below: every rule value he can quote, with what it is now. Seeing needs `settings.read`; saving
// `settings.write` (the API checks again). The page picker is a link per page (`?page=`), so each page has its own URL.
// PR 75 follow-up: the Contact page's tab also holds the contact form's card (`pages.contactForm`).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { DETAILS, isPolicyPage, POLICY_PAGES, policiesView, wordMax } from '@/lib/admin-policies/service';
import { locateKey } from '@/lib/admin-shell/sections';
import { ROUTES } from '@/lib/shop/routes';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-policies.bn.json';
import en from '../../../../../messages/admin-policies.en.json';
import '../settings.css';
import '../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/settings/policies';
const API = '/api/admin/policies';
const RULES = '/admin/rules';
const INBOX = '/admin/support';
const KEY = 'policies';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'pol.metaTitle'), robots: { index: false, follow: false } };
}

export default async function PoliciesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('settings.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  const asked = typeof sp.page === 'string' && isPolicyPage(sp.page) ? sp.page : POLICY_PAGES[0];
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(`${HERE}?page=${asked}`)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="settings.read" />
      </div>
    );
  const v = await policiesView({ db: access.deps.db, resolver: access.deps.resolver }, { actor: access.guard.actor, ctx: access.guard.ctx }, view.lang);
  const canEdit = access.guard.permissions?.has('settings.write') ?? false;
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `pol.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const total = POLICY_PAGES.length;
  const showing = v.pages.filter((p) => p.shows).length;
  const own = v.pages.filter((p) => p.own).length;
  const tokens = v.pages.flatMap((p) => p.tokens);
  const hidden = tokens.filter((x) => x.state !== 'ok').length;
  const page = v.pages.find((p) => p.slug === asked)!;
  const card = v.cards[asked];
  const pageName = s(`pages.${asked}`);

  const texts: FieldsCardTexts = {
    h: s('card.h', { page: pageName }),
    d: s('card.d'),
    save: s('save'),
    saving: s('saving'),
    saved: s('saved'),
    discard: s('discard'),
    unsaved: s('unsaved'),
    readOnly: s('readOnly'),
    pairHelp: s('pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'PLACEHOLDER', 'UNKNOWN_TOKEN', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, s(`err.${c}`)])),
  };
  const pair = (f: 'title' | 'lede' | 'body') => ({ en: s(`card.${f}.en`), bn: s(`card.${f}.bn`) });
  const fields: FieldsCardField[] = [
    { kind: 'switch', path: 'on', label: s('card.on'), help: s('card.onHelp') },
    { kind: 'select', path: 'details', label: s('card.details'), help: s('card.detailsHelp'), options: DETAILS.map((x) => ({ value: x, label: s(`card.d_${x}`) })) },
    { kind: 'checks', path: 'rules', label: s('card.rules'), options: v.ruleChoices },
    { kind: 'pair', path: 'title', label: pair('title'), help: s('card.titleHelp'), max: wordMax('title') },
    { kind: 'pair', path: 'lede', label: pair('lede'), max: wordMax('lede'), rows: 3 },
    { kind: 'pair', path: 'body', label: pair('body'), help: s('card.bodyHelp'), max: wordMax('body'), rows: 10 },
  ];
  const formFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('form.on'), help: s('form.onHelp') },
    { kind: 'number', path: 'perPhonePerDay', label: s('form.perDay'), help: s('form.perDayHelp'), min: 1, max: 20 },
    { kind: 'number', path: 'maxChars', label: s('form.maxChars'), help: s('form.maxCharsHelp'), min: 100, max: 2000 },
  ];
  const tone = !page.on ? 'line' : page.shows ? 'ok' : 'warn';
  const state = !page.on ? s('now.off') : page.shows ? s('now.shows') : s('now.soon');

  return (
    <div className="a2-z" data-testid="policies-page">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis">
        <div className="a2-card a2-kpi" data-testid="pol-kpi-shows" data-n={showing}>
          <div className="a2-kl">{s('kpi.shows')}</div>
          <div className="a2-kv">{s('kpi.of', { n: num(showing), total: num(total) })}</div>
          <div className="a2-kf">
            <span className="a2-kn">{showing === total ? s('kpi.allShow') : s('kpi.showsFoot')}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="pol-kpi-own">
          <div className="a2-kl">{s('kpi.own')}</div>
          <div className="a2-kv">{s('kpi.of', { n: num(own), total: num(total) })}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('kpi.ownFoot')}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="pol-kpi-tokens" data-hidden={hidden}>
          <div className="a2-kl">{s('kpi.tokens')}</div>
          <div className="a2-kv">{num(tokens.length)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{!tokens.length ? s('kpi.tokensNone') : hidden ? s('kpi.tokensHidden', { n: num(hidden) }) : s('kpi.tokensOk')}</span>
          </div>
        </div>
      </div>

      <nav className="a2-seg a2-mt12" aria-label={s('pages.aria')} data-testid="pol-pages">
        {v.pages.map((p) => (
          <Link key={p.slug} href={`${HERE}?page=${p.slug}`} className={p.slug === asked ? 'on' : undefined} aria-current={p.slug === asked ? 'page' : undefined} data-testid={`pol-page-${p.slug}`}>
            {s(`pages.${p.slug}`)}
          </Link>
        ))}
      </nav>

      <section className="a2-sc a2-mt12" aria-labelledby="pol-now-h" data-testid="pol-now" data-state={page.shows ? 'shows' : page.on ? 'soon' : 'off'}>
        <div className="a2-sch">
          <div>
            <h2 className="a2-h3" id="pol-now-h">
              {s('now.h')}: {pageName}
            </h2>
          </div>
          <span className={`a2-pill ${tone}`}>
            <i />
            {state}
          </span>
        </div>
        <p className="a2-sm a2-mt12">{s('now.rules')}</p>
        {page.rules.length ? (
          <ul className="a2-stack a2-mt12" style={{ gap: 6 }}>
            {page.rules.map((r) => (
              <li key={r.key} className="a2-gap8">
                <span className={`a2-pill ${!r.known ? 'bad' : r.live ? 'ok' : 'warn'}`}>{!r.known ? s('now.gone') : r.live ? s('now.live') : s('now.notLive')}</span>
                <span className="a2-sm">{r.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{s('now.noRules')}</p>
        )}
        {page.tokens.length ? (
          <>
            <p className="a2-sm a2-mt12">{s('now.tokens')}</p>
            <ul className="a2-stack a2-mt12" style={{ gap: 6 }} data-testid="pol-page-tokens">
              {page.tokens.map((x) => (
                <li key={x.raw} className="a2-gap8">
                  <span className={`a2-pill ${x.state === 'ok' ? 'ok' : x.state === 'unknown' ? 'bad' : 'warn'}`}>{s(`now.state.${x.state}`)}</span>
                  <code className="a2-sm">{x.raw}</code>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="a2-gap8 a2-mt12">
          <a className="a2-btn" href={ROUTES.help(asked)} target="_blank" rel="noopener" data-testid="pol-open">
            <ShellIcon name="ext" size={14} />
            {s('now.open')}
          </a>
          <Link className="a2-btn" href={RULES}>
            {s('now.openRules')}
          </Link>
        </div>
      </section>

      <FieldsCard key={asked} url={API} screen={{ key: card.key, value: card.value, version: card.version }} fields={fields} texts={texts} canEdit={canEdit} testId="pol-card" />

      {asked === 'contact' ? (
        <>
          {/* PR 75 follow-up: the contact page's "Send us a message" form (`pages.contactForm`, off as shipped) */}
          <FieldsCard url={API} screen={{ key: v.form.key, value: v.form.value, version: v.form.version }} fields={formFields} texts={{ ...texts, h: s('form.h'), d: s('form.d') }} canEdit={canEdit} testId="pol-contact-form" />
          <div className="a2-gap8 a2-mt12">
            <Link className="a2-btn" href={INBOX} data-testid="pol-contact-inbox">
              {s('form.inbox')}
            </Link>
          </div>
        </>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="pol-values-h" data-testid="pol-values">
        <div className="a2-sch">
          <div>
            <h2 className="a2-h3" id="pol-values-h">
              {s('values.h')}
            </h2>
            <p className="a2-scd">{s('values.d')}</p>
          </div>
        </div>
        {v.values.length ? (
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th>{s('values.token')}</th>
                  <th>{s('values.rule')}</th>
                  <th>{s('values.what')}</th>
                  <th>{s('values.now')}</th>
                </tr>
              </thead>
              <tbody>
                {v.values.map((x) => (
                  <tr key={x.token}>
                    <td>
                      <code>{x.token}</code>
                    </td>
                    <td>{x.rule}</td>
                    <td>{x.label}</td>
                    <td>
                      {x.now ?? s('values.empty')}
                      {x.live ? null : <span className="a2-pill warn" style={{ marginLeft: 6 }}>{s('values.notLive')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12">{s('values.none')}</p>
        )}
      </section>
    </div>
  );
}
