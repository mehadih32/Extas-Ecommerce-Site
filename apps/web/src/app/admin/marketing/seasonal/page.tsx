// S13 · PR 280 (register "Seasonal homepage switching, scheduled"; Blueprint CN-012 (1), D10.3) — Marketing › Seasonal
// home at /admin/marketing/seasonal: what the home page shows now (the live window's look, or the usual home page), the
// schedule (each window with its look, start, end and state; "Stop" for a live or upcoming one; "Schedule a look"),
// the saved looks (each with its sections, hero title and collection; "Change this look"; set aside / bring back),
// "Save the home page as it is now", and the settings card (the switch). Off as shipped (`marketing.seasonalHome`).
// Seeing needs `marketing.campaigns.read`; changing needs `marketing.campaigns.write` (the API checks again).
// lib/marketing/seasonal-home.ts. Guide: docs/admin-guide/pages/marketing/seasonal-home.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { HOME_SECTIONS } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { SeasonalAct, SeasonalLookEditor, SeasonalSaveForm, SeasonalWindowForm, type SeasonalFormTexts } from '@/components/admin/marketing/SeasonalForms';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { HERO_LINES, seasonalHomeOverview, type LookRow, type WindowRow } from '@/lib/marketing/seasonal-home';
import bn from '../../../../../messages/admin-seasonal-home.bn.json';
import en from '../../../../../messages/admin-seasonal-home.en.json';
import '../../settings-cards.css';
import '../../messages/email/email.css';
import '../ad-platforms/ad-platforms.css';
import '../outreach/outreach.css';
import './seasonal.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/seasonal';
const API = '/api/admin/marketing/seasonal';
const KEY = 'marketingSeasonalHome';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'sh.metaTitle'), robots: { index: false, follow: false } };
}

export default async function SeasonalHomePage() {
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
  const o = await seasonalHomeOverview({ db: access.deps.db, resolver: access.deps.resolver });
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const on = o.settings.enabled;
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `sh.${k}`, vars);
  const bnView = view.lang === 'bn';
  const wall = (v: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(`${v}:00Z`));
  const errKeys = ['INVALID_INPUT', 'SWITCHED_OFF', 'NOT_FOUND', 'STALE', 'OVERLAP', 'IN_USE', 'ENDED', 'forbidden', 'unauthorized', 'network', 'other'];
  const err = Object.fromEntries(errKeys.map((k) => [k, g(`err.${k}`)]));
  const fieldKeys = ['name', 'sections', 'eyebrow', 'title', 'sub', 'collection', 'starts', 'ends', 'lookId', 'id', 'home.sections', 'home.hero', 'home.heroSlides', 'home.categories', 'home.newIn', 'home.reviews'];
  const texts: SeasonalFormTexts = { err, fields: Object.fromEntries(fieldKeys.map((k) => [k, g(`f.${k}`)])) };
  const c = (k: string) => g(`card.${k}`);
  const cardTexts: FieldsCardTexts = { h: c('h'), d: c('d'), save: c('save'), saving: c('saving'), saved: c('saved'), discard: c('discard'), unsaved: c('unsaved'), readOnly: c('readOnly'), pairHelp: c('pairHelp'), err };
  const cardFields: FieldsCardField[] = [{ kind: 'switch', path: 'enabled', label: c('on'), help: c('onHelp') }];
  const secNames = Object.fromEntries(HOME_SECTIONS.map((id) => [id, g(`sec.${id}`)]));
  const collName = (slug: string | null) => {
    if (!slug) return g('look.collNone');
    const col = o.collections.find((x) => x.slug === slug);
    return col ? (bnView && col.nameBn ? col.nameBn : col.nameEn) : slug;
  };
  const collections = o.collections.map((x) => ({ value: x.slug, label: bnView && x.nameBn ? x.nameBn : x.nameEn }));
  const live = o.looks.filter((l) => !l.archived);
  const aside = o.looks.filter((l) => l.archived);
  const lineW = Object.fromEntries(HERO_LINES.map((l) => [l, g(`edit.${l}`)])) as Record<(typeof HERO_LINES)[number], string>;
  const span = (w: WindowRow) => g('win.span', { starts: wall(w.starts), ends: w.ends ? wall(w.ends) : g('win.open') });

  const windowItem = (w: WindowRow) => (
    <li key={w.id} className="adp-rule" data-testid="sh-window" data-state={w.state}>
      <p className="a2-sm adp-sub or-break">
        {w.lookName} <span className={`a2-pill ${w.state === 'LIVE' ? 'ok' : 'line'}`}>{g(`win.state.${w.state}`)}</span>
      </p>
      <p className="a2-xs a2-mute">{span(w)}</p>
      {canWrite && (w.state === 'LIVE' || w.state === 'UPCOMING') ? (
        <span className="a2-gap8 or-mt8 or-acts">
          <SeasonalAct texts={texts} body={{ action: 'window.stop', id: w.id }} label={g('win.stop')} testId="sh-stop" />
        </span>
      ) : null}
    </li>
  );

  const lookItem = (l: LookRow) => {
    const shown = l.sections.filter((s) => s.on).map((s) => g(`sec.${s.id}`));
    const title = l.hero.title ? (bnView ? l.hero.title.bn : l.hero.title.en) : g('look.usualWords');
    return (
      <li key={l.id} className="adp-rule" data-testid="sh-look" data-archived={l.archived ? 'yes' : 'no'}>
        <p className="a2-sm adp-sub or-break">
          {l.name} {l.inUse ? <span className="a2-pill line">{g('look.inUse')}</span> : null}
        </p>
        <p className="a2-xs a2-mute or-break">
          {g('look.sections')}: {shown.length ? shown.join(' · ') : g('look.noSections')}
        </p>
        <p className="a2-xs a2-mute or-break">
          {g('look.heroTitle')}: {title}
        </p>
        <p className="a2-xs a2-mute or-break">
          {g('look.collection')}: {collName(l.collection)}
        </p>
        {on && canWrite && !l.archived ? (
          <details className="a2-mt12 a2-more-opts">
            <summary className="a2-sm a2-b">{g('look.edit')}</summary>
            <SeasonalLookEditor
              key={`${l.id}-${JSON.stringify(l)}`}
              texts={texts}
              id={l.id}
              value={{ name: l.name, sections: l.sections, hero: l.hero, collection: l.collection }}
              sectionNames={secNames}
              collections={collections}
              w={{ name: g('edit.name'), sections: g('edit.sections'), sectionsHelp: g('edit.sectionsHelp'), up: g('edit.up'), down: g('edit.down'), lines: lineW, en: g('edit.en'), bn: g('edit.bn'), lineHelp: g('edit.lineHelp'), collection: g('edit.collection'), collNone: g('look.collNone'), collHelp: g('edit.collHelp'), save: g('edit.save'), saved: g('edit.saved') }}
            />
          </details>
        ) : null}
        {canWrite && !l.inUse && (on || !l.archived) ? (
          <span className="a2-gap8 or-mt8 or-acts">
            <SeasonalAct texts={texts} body={{ action: l.archived ? 'look.restore' : 'look.archive', id: l.id }} label={g(l.archived ? 'look.restore' : 'look.archive')} testId="sh-toggle" />
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <div className="a2-z" data-testid="sh-page">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note or-mt8" role="note">
        <span>{g('note')}</span>
      </div>
      {!on ? (
        <section className="a2-card a2-mt12" data-testid="sh-off">
          <h2 className="a2-h3">{g('offTitle')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{g(canWrite ? 'offBody' : 'offAsk')}</p>
        </section>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="sh-now-h" data-testid="sh-now">
        <h2 className="a2-h3" id="sh-now-h">
          {g('now.h')}
        </h2>
        <p className="a2-sm or-mt8" data-testid="sh-now-text">
          {o.live ? g('now.live', { look: o.live.lookName, until: o.live.ends ? wall(o.live.ends) : g('win.open') }) : g('now.usual')}
        </p>
        <span className="a2-gap8 or-mt8 or-acts">
          <a className="a2-btn" href="/" target="_blank" rel="noopener noreferrer" data-testid="sh-open-home">
            {g('now.open')}
          </a>
        </span>
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="sh-win-h" data-testid="sh-windows">
        <h2 className="a2-h3" id="sh-win-h">
          {g('win.h')}
        </h2>
        <p className="a2-xs a2-mute or-mt8">{g('win.clock', { tz: o.timeZone })}</p>
        {o.windows.length ? <ul className="adp-rules">{o.windows.map(windowItem)}</ul> : <p className="a2-sm a2-mute or-mt8">{g('win.empty')}</p>}
        {on && canWrite && live.length ? (
          <details className="a2-mt12 a2-more-opts" data-testid="sh-win-fold">
            <summary className="a2-sm a2-b">{g('win.addH')}</summary>
            <SeasonalWindowForm texts={texts} looks={live.map((l) => ({ value: l.id, label: l.name }))} w={{ look: g('win.look'), starts: g('win.starts'), ends: g('win.ends'), endsHelp: g('win.endsHelp'), clock: g('win.clock', { tz: o.timeZone }), add: g('win.add'), added: g('win.added') }} />
          </details>
        ) : null}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="sh-looks-h" data-testid="sh-looks">
        <h2 className="a2-h3" id="sh-looks-h">
          {g('looks.h')}
        </h2>
        {live.length ? <ul className="adp-rules">{live.map(lookItem)}</ul> : <p className="a2-sm a2-mute or-mt8">{g('looks.empty')}</p>}
        {on && canWrite ? (
          <details className="a2-mt12 a2-more-opts" data-testid="sh-save-fold" open={!o.looks.length}>
            <summary className="a2-sm a2-b">{g('save.h')}</summary>
            <SeasonalSaveForm texts={texts} w={{ name: g('save.name'), namePh: g('save.namePh'), help: g('save.help'), save: g('save.save'), saved: g('save.saved') }} />
          </details>
        ) : null}
      </section>

      {aside.length ? (
        <section className="a2-sc a2-mt12" aria-labelledby="sh-aside-h" data-testid="sh-aside">
          <h2 className="a2-h3" id="sh-aside-h">
            {g('looks.archivedH')}
          </h2>
          <ul className="adp-rules">{aside.map(lookItem)}</ul>
        </section>
      ) : null}

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: o.card.key, value: o.card.value, version: o.card.version }} fields={cardFields} texts={cardTexts} canEdit={canWrite} testId="sh-card" />
      </div>
    </div>
  );
}
