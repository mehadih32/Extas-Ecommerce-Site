// S02 · PR 81 (register "The eye-toggle dashboard: every switch in one list, searchable"; BACKEND-ARCHITECTURE WEB-06
// Eye-toggles; Blueprint D4 "Every switch is listed in one searchable eye-toggle dashboard") — Website › More ›
// Eye-toggles at /admin/website/eye-toggles (?q=, ?where=<place>, ?show=all | shown | hidden | changed open the list
// already filtered): every eye-toggle of PR 80 (@extas/settings eye-toggles.ts) by place, each with its screens, its
// shipped value and its switch; Save writes every marked change at once. Seeing needs `website.read`; saving
// `website.eye.write` (the API checks again; audited `website.eye.save`). lib/website/eye-admin.ts,
// components/admin/website/EyeList.tsx. Guide: docs/admin-guide/pages/website/eye-toggles.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { EYE_AREAS } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { EyeList, type EyeListRow, type EyeListTexts } from '@/components/admin/website/EyeList';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { eyeView } from '@/lib/website/eye-admin';
import bn from '../../../../../messages/admin-eye.bn.json';
import en from '../../../../../messages/admin-eye.en.json';
import '../../settings-cards.css';
import './eye.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/eye-toggles';
const KEY = 'websiteEyeToggles';
const API = '/api/admin/website/eye-toggles';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'ey.metaTitle'), robots: { index: false, follow: false } };
}

export default async function EyeTogglesPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `ey.${k}`, vars);
  const v = await eyeView({ db: access.deps.db, resolver: access.deps.resolver });
  const canEdit = access.guard.permissions?.has('website.eye.write') ?? false;
  const labels = (view.lang === 'bn' ? bn : en).ey.labels as Record<string, string>;
  const rows: EyeListRow[] = v.rows.map((r) => ({ id: r.id, area: r.area, label: labels[r.id] ?? r.id, areaLabel: g(`area.${r.area}`), screenLabel: g(`screen.${r.screen}`), shown: r.shown, def: r.def }));
  const errKeys = ['INVALID_INPUT', 'STALE', 'forbidden', 'unauthorized', 'network', 'other'];
  const texts: EyeListTexts = {
    search: g('search'),
    searchPh: g('searchPh'),
    where: g('where'),
    everywhere: g('everywhere'),
    show: g('show'),
    showOpt: { all: g('showOpt.all'), shown: g('showOpt.shown'), hidden: g('showOpt.hidden'), changed: g('showOpt.changed') },
    clear: g('clear'),
    found: g('found', { n: '{n}' }),
    summary: g('summary', { total: '{total}', hidden: '{hidden}', changed: '{changed}' }),
    none: g('none'),
    asShippedOn: g('asShipped', { v: g('on') }),
    asShippedOff: g('asShipped', { v: g('off') }),
    back: g('back'),
    save: g('save'),
    saving: g('saving'),
    saved: g('saved'),
    discard: g('discard'),
    unsaved: g('unsaved', { n: '{n}' }),
    readOnly: g('readOnly'),
    err: Object.fromEntries(errKeys.map((k) => [k, g(`err.${k}`, { details: '{details}' })])),
  };

  return (
    <div className="a2-z" data-testid="ey-page">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note a2-mt12" role="note">
        <span>{g('note')}</span>
      </div>
      <EyeList
        api={API}
        rows={rows}
        version={v.version}
        canEdit={canEdit}
        areas={EYE_AREAS.map((a) => ({ id: a, label: g(`area.${a}`) }))}
        texts={texts}
        initial={{ q: (sp.get('q') ?? '').slice(0, 120), area: sp.get('where') ?? '', show: sp.get('show') ?? 'all' }}
      />
    </div>
  );
}
