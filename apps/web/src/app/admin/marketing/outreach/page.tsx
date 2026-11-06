// S13 · PR 279 (register "SEO outreach pipeline"; ADMIN-ARCHITECTURE 4.8 Marketing › More options) — Marketing › SEO
// outreach at /admin/marketing/outreach: where things stand (sites per stage, follow-ups due), "Add a site", the
// pipeline stage by stage (found, asked, answered, link live, said no) with each site's contact, notes, follow-up day,
// live link, "Write to them" (a mailto: link that opens the owner's own e-mail app with his pitch; nothing is sent from
// the shop) and "Move along or change", the sites set aside, and the settings card (the switch, the follow-up gap, the
// pitch words). Off as shipped (`marketing.outreach`). Seeing needs `marketing.campaigns.read`; changing needs
// `marketing.campaigns.write` (the API checks again). lib/marketing/outreach.ts. Guide:
// docs/admin-guide/pages/marketing/outreach.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { OutreachAct, OutreachAddForm, OutreachEditForm, type OutreachFormTexts } from '@/components/admin/marketing/OutreachForms';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { fillPitch, OUTREACH_STAGES, outreachOverview, pitchMailto, type OutreachRow } from '@/lib/marketing/outreach';
import { shopOrigin } from '@/lib/shop/meta';
import bn from '../../../../../messages/admin-outreach.bn.json';
import en from '../../../../../messages/admin-outreach.en.json';
import '../../settings-cards.css';
import '../../messages/email/email.css';
import '../ad-platforms/ad-platforms.css';
import './outreach.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/outreach';
const API = '/api/admin/marketing/outreach';
const KEY = 'marketingOutreach';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'or.metaTitle'), robots: { index: false, follow: false } };
}

export default async function OutreachPage() {
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
  const [o, origin] = await Promise.all([outreachOverview({ db: access.deps.db, resolver: access.deps.resolver }), shopOrigin(MOTHER_STORE_ID)]);
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const on = o.settings.enabled;
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `or.${k}`, vars);
  const n = (x: number) => formatNumber(x, view.locale);
  const day = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));
  const errKeys = ['INVALID_INPUT', 'EXISTS', 'SWITCHED_OFF', 'NOT_FOUND', 'STALE', 'forbidden', 'unauthorized', 'network', 'other'];
  const err = Object.fromEntries(errKeys.map((k) => [k, g(`err.${k}`)]));
  const texts: OutreachFormTexts = { err, fields: Object.fromEntries(['site', 'status', 'linkUrl', 'nextStepOn', 'id'].map((k) => [k, g(`f.${k}`)])) };
  const c = (k: string) => g(`card.${k}`);
  const pair = (k: string) => ({ en: `${c(k)} · ${c('en')}`, bn: `${c(k)} · ${c('bn')}` });
  const cardTexts: FieldsCardTexts = { h: c('h'), d: c('d'), save: c('save'), saving: c('saving'), saved: c('saved'), discard: c('discard'), unsaved: c('unsaved'), readOnly: c('readOnly'), pairHelp: c('pairHelp'), err };
  const cardFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: c('on'), help: c('onHelp') },
    { kind: 'number', path: 'followUpDays', label: c('followUpDays'), help: c('followUpDaysHelp'), min: 0, max: 90 },
    { kind: 'pair', path: 'pitchSubject', label: pair('pitchSubject'), help: c('pitchHelp'), max: 200 },
    { kind: 'pair', path: 'pitchBody', label: pair('pitchBody'), help: c('pitchHelp'), max: 2000, rows: 6 },
  ];
  const stages = OUTREACH_STAGES.map((s) => ({ value: s, label: g(`stage.${s}`) }));
  const shop = origin?.origin ?? '';
  const pitchLangs = o.settings.pitchSubject || o.settings.pitchBody ? (['en', 'bn'] as const) : [];
  const mailto = (p: OutreachRow, lang: 'en' | 'bn') => pitchMailto(p.email!, fillPitch(o.settings.pitchSubject?.[lang] ?? '', { site: p.site, shop }), fillPitch(o.settings.pitchBody?.[lang] ?? '', { site: p.site, shop }));
  const live = o.prospects.filter((p) => !p.archived);
  const aside = o.prospects.filter((p) => p.archived);
  const needPitch = on && canWrite && !pitchLangs.length && live.some((p) => !!p.email);
  const total = (label: string, value: string, id: string) => (
    <div key={id}>
      <dt className="a2-sm">{label}</dt>
      <dd className="a2-sm" data-testid={id}>
        {value}
      </dd>
    </div>
  );
  const item = (p: OutreachRow) => (
    <li key={p.id} className="adp-rule" data-testid="or-prospect" data-stage={p.status} data-archived={p.archived ? 'yes' : 'no'}>
      <p className="a2-sm adp-sub or-break">
        {p.site} {p.due ? <span className="a2-pill warn">{g('list.due')}</span> : null}
      </p>
      {p.contact ? <p className="a2-sm a2-mute or-break">{p.contact}</p> : null}
      {p.nextStepOn && !p.archived && (p.status === 'FOUND' || p.status === 'ASKED' || p.status === 'ANSWERED') ? <p className="a2-xs a2-mute">{g('list.next', { when: day(`${p.nextStepOn}T00:00:00Z`) })}</p> : null}
      {p.status === 'LIVE' && p.linkUrl ? (
        <p className="a2-xs or-break">
          {g('list.liveLink')}:{' '}
          <a href={p.linkUrl} target="_blank" rel="noopener noreferrer nofollow" data-testid="or-live-link">
            {p.linkUrl}
          </a>
          {p.liveAt ? <span className="a2-mute"> · {g('list.live', { when: day(p.liveAt) })}</span> : null}
        </p>
      ) : null}
      {p.notes ? (
        <p className="a2-xs a2-mute or-mt8 or-notes">
          {g('list.notes')}: {p.notes}
        </p>
      ) : null}
      {on && canWrite && !p.archived ? (
        <details className="a2-mt12 a2-more-opts">
          <summary className="a2-sm a2-b">{g('list.edit')}</summary>
          <OutreachEditForm
            key={`${p.id}-${p.status}-${p.nextStepOn ?? ''}-${p.linkUrl ?? ''}`}
            texts={texts}
            id={p.id}
            stages={stages}
            value={{ status: p.status, contact: p.contact, notes: p.notes, linkUrl: p.linkUrl ?? '', nextStepOn: p.nextStepOn ?? '' }}
            w={{ stage: g('edit.stage'), contact: g('edit.contact'), notes: g('edit.notes'), linkUrl: g('edit.linkUrl'), linkUrlPh: g('edit.linkUrlPh'), linkHelp: g('edit.linkHelp'), nextStepOn: g('edit.nextStepOn'), nextHelp: g('edit.nextHelp'), save: g('edit.save'), saved: g('edit.saved') }}
          />
        </details>
      ) : null}
      <span className="a2-gap8 or-mt8 or-acts">
        <a className="a2-btn" href={`https://${p.site}`} target="_blank" rel="noopener noreferrer nofollow">
          {g('list.open')}
        </a>
        {!p.archived && p.email && (p.status === 'FOUND' || p.status === 'ASKED')
          ? pitchLangs.map((lang) => (
              <a key={lang} className="a2-btn" href={mailto(p, lang)} data-testid="or-write">
                {g(lang === 'en' ? 'list.writeEn' : 'list.writeBn')}
              </a>
            ))
          : null}
        {canWrite && (on || !p.archived) ? <OutreachAct texts={texts} body={{ action: p.archived ? 'prospect.restore' : 'prospect.archive', id: p.id }} label={g(p.archived ? 'list.restore' : 'list.archive')} testId="or-toggle" /> : null}
      </span>
    </li>
  );

  return (
    <div className="a2-z" data-testid="or-page">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note or-mt8" role="note">
        <span>{g('note')}</span>
      </div>
      {!on ? (
        <section className="a2-card a2-mt12" data-testid="or-off">
          <h2 className="a2-h3">{g('offTitle')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{g(canWrite ? 'offBody' : 'offAsk')}</p>
        </section>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="or-tot-h" data-testid="or-totals">
        <h2 className="a2-h3" id="or-tot-h">
          {g('totals.h')}
        </h2>
        <dl className="or-totals">
          {OUTREACH_STAGES.map((s) => total(g(`stage.${s}`), n(o.totals.byStage[s]), `or-t-${s}`))}
          {total(g('totals.due'), n(o.totals.due), 'or-t-due')}
        </dl>
        {needPitch ? <p className="a2-xs a2-mute or-mt8">{g('list.noPitch')}</p> : null}
        {on && canWrite ? (
          <details className="a2-mt12 a2-more-opts" data-testid="or-add-fold" open={!o.prospects.length}>
            <summary className="a2-sm a2-b">{g('add.h')}</summary>
            <OutreachAddForm texts={texts} w={{ site: g('add.site'), sitePh: g('add.sitePh'), contact: g('add.contact'), contactPh: g('add.contactPh'), notes: g('add.notes'), add: g('add.add'), added: g('add.added') }} />
          </details>
        ) : null}
      </section>

      {OUTREACH_STAGES.map((s) => {
        const rows = live.filter((p) => p.status === s);
        return (
          <section key={s} className="a2-sc a2-mt12" aria-labelledby={`or-${s}-h`} data-testid={`or-stage-${s}`}>
            <h2 className="a2-h3" id={`or-${s}-h`}>
              {g(`stage.${s}`)} <span className="a2-pill line">{n(rows.length)}</span>
            </h2>
            {rows.length ? <ul className="adp-rules">{rows.map(item)}</ul> : <p className="a2-sm a2-mute or-mt8">{g('list.empty')}</p>}
          </section>
        );
      })}

      {aside.length ? (
        <section className="a2-sc a2-mt12" aria-labelledby="or-aside-h" data-testid="or-aside">
          <h2 className="a2-h3" id="or-aside-h">
            {g('list.archivedH')} <span className="a2-pill line">{n(aside.length)}</span>
          </h2>
          <ul className="adp-rules">{aside.map(item)}</ul>
        </section>
      ) : null}

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: o.card.key, value: o.card.value, version: o.card.version }} fields={cardFields} texts={cardTexts} canEdit={canWrite} testId="or-card" />
      </div>
    </div>
  );
}
