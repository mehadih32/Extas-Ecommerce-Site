// S13 · PR 281 — Marketing › Festive cut-off at /admin/marketing/festive (register "Festive cut-off banners and the
// delivery promise"): the switch and where the live festive Smart Rules' words show on the shop (the home page's
// festive section, under the product page's stock line, checkout and the thank-you page in place of the usual promise
// once a band passed its time), the home section's heading and link, and what each switched-on festive rule says now
// — each band's last order time on the shop's clock and whether it passed. The rules, dates and words are made in
// Smart Rules (PR 214); this page writes only `marketing.festiveCutoff` (registry v216, off as shipped). Seeing needs
// `marketing.campaigns.read`, the card `marketing.campaigns.write`. Guide: docs/admin-guide/pages/marketing/festive.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { FESTIVE_CUTOFF_PLACES, FESTIVE_TITLE_MAX } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { festiveCutoffOverview, type FestiveRuleRow } from '@/lib/marketing/festive-cutoff';
import bn from '../../../../../messages/admin-festive.bn.json';
import en from '../../../../../messages/admin-festive.en.json';
import '../../settings-cards.css';
import '../ad-platforms/ad-platforms.css';
import '../outreach/outreach.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/festive';
const API = '/api/admin/marketing/festive';
const KEY = 'marketingFestive';
/** The shop path's longest length the card takes (the settings' own shop-path guard). */
const HREF_MAX = 300; // hardcode-ok: shopPathSchema's own length guard

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'fc.metaTitle'), robots: { index: false, follow: false } };
}

export default async function FestiveCutoffPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const o = await festiveCutoffOverview({ db: access.deps.db, resolver: access.deps.resolver });
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const on = o.settings.enabled;
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `fc.${k}`, vars);
  const bnView = view.lang === 'bn';
  const when = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: o.timeZone }).format(new Date(iso));
  const err = Object.fromEntries(['INVALID_INPUT', 'STALE', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, g(`err.${k}`)]));
  const c = (k: string) => g(`card.${k}`);
  const cardTexts: FieldsCardTexts = { h: c('h'), d: c('d'), save: c('save'), saving: c('saving'), saved: c('saved'), discard: c('discard'), unsaved: c('unsaved'), readOnly: c('readOnly'), pairHelp: c('pairHelp'), err };
  const cardFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: c('on'), help: c('onHelp') },
    { kind: 'checks', path: 'places', label: c('places'), options: FESTIVE_CUTOFF_PLACES.map((p) => ({ value: p, label: g(`place.${p}`) })) },
    { kind: 'pair', path: 'title', label: { en: c('title.en'), bn: c('title.bn') }, help: c('titleHelp'), max: FESTIVE_TITLE_MAX },
    { kind: 'text', path: 'linkHref', label: c('linkHref'), help: c('linkHrefHelp'), max: HREF_MAX },
    { kind: 'pair', path: 'linkLabel', label: { en: c('linkLabel.en'), bn: c('linkLabel.bn') }, help: c('linkLabelHelp'), max: FESTIVE_TITLE_MAX },
  ];
  const stateKey = { open: 'stOpen', closed: 'stClosed', none: 'stNone' } as const;

  const ruleItem = (r: FestiveRuleRow) => (
    <li key={r.key} className="adp-rule" data-testid="fc-rule" data-state={r.state}>
      <p className="a2-sm adp-sub or-break">
        {(bnView && r.name.bn) || r.name.en} <span className={`a2-pill ${r.state === 'open' ? 'ok' : 'line'}`}>{g(`rules.${stateKey[r.state]}`)}</span>
      </p>
      <p className="a2-xs a2-mute">
        {g('rules.places')}: {r.places.length ? r.places.map((p) => g(`place.${p}`)).join(' · ') : '—'}
      </p>
      <ul className="a2-xs or-mt8" data-testid="fc-cuts">
        {r.cuts.map((x) => (
          <li key={x.band} className="or-break">
            {(x.bandName && ((bnView && x.bandName.bn) || x.bandName.en)) || x.band} — {when(x.at)} · {g(x.passed ? 'rules.passed' : 'rules.ahead')}
          </li>
        ))}
      </ul>
      <p className="a2-sm or-mt8 or-break" data-testid="fc-says">
        <span className="a2-b">{g('rules.says')}:</span> {(bnView ? r.now.bn : r.now.en) ?? g('rules.nothing')}
      </p>
    </li>
  );

  return (
    <div className="a2-z" data-testid="fc-page">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note or-mt8" role="note">
        <span>{g('note')}</span>
      </div>
      {!on ? (
        <section className="a2-card a2-mt12" data-testid="fc-off">
          <h2 className="a2-h3">{g('offTitle')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{g(canWrite ? 'offBody' : 'offAsk')}</p>
        </section>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="fc-rules-h" data-testid="fc-rules">
        <h2 className="a2-h3" id="fc-rules-h">
          {g('rules.h')}
        </h2>
        {o.rules.length ? <ul className="adp-rules">{o.rules.map(ruleItem)}</ul> : <p className="a2-sm a2-mute or-mt8">{g('rules.empty')}</p>}
        <span className="a2-gap8 or-mt8 or-acts">
          <Link className="a2-btn" href="/admin/rules" data-testid="fc-open-rules">
            {g('rules.open')}
          </Link>
        </span>
      </section>

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: o.card.key, value: o.card.value, version: o.card.version }} fields={cardFields} texts={cardTexts} canEdit={canWrite} testId="fc-card" />
      </div>
    </div>
  );
}
