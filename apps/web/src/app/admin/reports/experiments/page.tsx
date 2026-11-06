// S02 · PR 83 (register "A/B test module for the storefront"; BACKEND-ARCHITECTURE REP-08 Experiments; demo
// 97y-adm2-reports.js "REP-08 Experiments") — Reports › More › Experiments at /admin/reports/experiments (?show=archived
// for the archived ones): the module's card (`experiments.module`: the switch, off as shipped, and its numbers), then
// every A/B test as a card with its two versions, how sure the result is, what B changes, preview links and its steps.
// Seeing needs `reports.experiments.read`; writing, the steps and the card `reports.experiments.write` (the API checks
// again). A test changes only words and shown or hidden parts, never a price, a discount, COD or a delivery charge.
// lib/experiments/admin.ts, components/admin/reports/ExperimentCard.tsx. Guide: docs/admin-guide/pages/reports/experiments.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ExperimentCard } from '@/components/admin/reports/ExperimentCard';
import { FieldsCard, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { experimentsView } from '@/lib/experiments/admin';
import { t, type Dict } from '@/lib/i18n';
import eyeBn from '../../../../../messages/admin-eye.bn.json';
import eyeEn from '../../../../../messages/admin-eye.en.json';
import bn from '../../../../../messages/admin-experiments.bn.json';
import en from '../../../../../messages/admin-experiments.en.json';
import '../../settings-cards.css';
import './experiments.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/reports/experiments';
const KEY = 'reportsExperiments';
const API = '/api/admin/reports/experiments';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'xp.metaTitle'), robots: { index: false, follow: false } };
}

export default async function ExperimentsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, raw] = await Promise.all([adminView(deps), pageAccess('reports.experiments.read', deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  const archived = raw.show === 'archived';
  const here = archived ? `${HERE}?show=archived` : HERE;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="reports.experiments.read" />
      </div>
    );
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `xp.${k}`, vars);
  const v = await experimentsView({ db: access.deps.db, resolver: access.deps.resolver }, { archived });
  const canWrite = access.guard.permissions?.has('reports.experiments.write') ?? false;
  const lang = view.lang === 'bn' ? 'bn' : 'en';
  const eyeLabels = (lang === 'bn' ? eyeBn : eyeEn).ey.labels as Record<string, string>;
  const feTexts: FieldsCardTexts = {
    h: g('fe.h'),
    d: g('fe.d'),
    save: g('fe.save'),
    saving: g('fe.saving'),
    saved: g('fe.saved'),
    discard: g('fe.discard'),
    unsaved: g('fe.unsaved'),
    readOnly: g('fe.readOnly'),
    pairHelp: g('fe.pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, g(`err.${k}`, { fields: '' })])),
  };
  const shopHome = lang === 'bn' ? '/bn' : '/';

  return (
    <div className="a2-z" data-testid="xp-page">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note a2-mt12" role="note">
        <span>{g('note')}</span>
      </div>
      {canWrite ? null : <p className="a2-xs a2-mute xpb-mt6">{g('readOnly')}</p>}
      <div className="a2-mt12" data-testid="xp-module">
        <FieldsCard
          url={API}
          screen={v.card}
          fields={[
            { kind: 'switch', path: 'enabled', label: g('fe.enabled'), help: g('fe.enabledHelp') },
            { kind: 'number', path: 'confidence', label: g('fe.confidence'), help: g('fe.confidenceHelp'), min: 80, max: 99 },
            { kind: 'number', path: 'minVisitors', label: g('fe.minVisitors'), help: g('fe.minVisitorsHelp'), min: 10, max: 1_000_000 },
            { kind: 'number', path: 'cookieDays', label: g('fe.cookieDays'), help: g('fe.cookieDaysHelp'), min: 1, max: 365 },
          ]}
          texts={feTexts}
          canEdit={canWrite}
          testId="xp-module-card"
        />
      </div>
      {v.card.value.enabled ? null : (
        <p className="a2-xs xpb-warn xpb-mt6" data-testid="xp-off">
          {g('moduleOff')}
        </p>
      )}
      <div className="xpb-bar">
        {canWrite && !archived ? (
          <Link className="a2-btn pri" href={`${HERE}/new`} data-testid="xp-new">
            {g('newTest')}
          </Link>
        ) : null}
        <Link className="a2-btn" href={archived ? HERE : `${HERE}?show=archived`} data-testid="xp-archived">
          {archived ? g('showCurrent') : g('showArchived')}
        </Link>
      </div>
      <p className="a2-xs a2-mute xpb-mt6">{g('previewHelp')}</p>
      {v.tests.length ? null : (
        <p className="a2-sm a2-mute a2-mt12" data-testid="xp-none">
          {archived ? g('noneArchived') : g('none')}
        </p>
      )}
      {v.tests.map((r) => (
        <ExperimentCard key={r.id} r={r} g={g} lang={lang} eyeLabels={eyeLabels} need={v.card.value.confidence} min={v.card.value.minVisitors} canWrite={canWrite} api={API} href={`${HERE}/${r.id}`} shopHome={shopHome} />
      ))}
    </div>
  );
}
