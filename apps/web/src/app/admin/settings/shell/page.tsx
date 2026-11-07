// PR 495 (12) follow-up 205 (CN-018) — Settings › More › Start & search at /admin/settings/shell, in the Lumen look
// (data-lm-ready, --lm-* tokens, the one toast): first the two search-box helpers of follow-up 209 as Lumen switch cards
// (recent pages with how many, key jumps; both off as shipped), then the start page per role (`admin.startPages`), the
// search box and badges (`admin.shell`) and the Dashboard's choices (`admin.dashboard`), each a card saved whole with
// its version. Until now these were set only through `settings cli.ts set`. Seeing needs `settings.read`; saving
// `settings.write` (the API checks again; audited settings.adminShell.save). lib/admin-shell/shell-settings.ts.
// Guide: docs/admin-guide/pages/settings/shell.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { SettingCards } from '@/components/admin/lumen/SettingCards';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { RECENT_KEPT } from '@/lib/admin-shell/shortcuts';
import { START_SECTIONS, shellScreen, type ShellCardKey } from '@/lib/admin-shell/shell-settings';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-shell-settings.bn.json';
import en from '../../../../../messages/admin-shell-settings.en.json';
import '../../settings-cards.css';
import './shell.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/settings/shell';
const API = '/api/admin/settings/shell';
const KEY = 'settingsShell';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'ss.metaTitle'), robots: { index: false, follow: false } };
}

export default async function ShellSettingsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('settings.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="ss-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="settings.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `ss.${k}`, vars);
  const screen = await shellScreen({ db: access.deps.db, resolver: access.deps.resolver }, { actor: access.guard.actor, ctx: access.guard.ctx });
  const canEdit = access.guard.permissions?.has('settings.write') ?? false;
  const texts = (k: string): FieldsCardTexts => ({
    h: s(`${k}.h`),
    d: s(`${k}.d`),
    save: s('save'),
    saving: s('saving'),
    saved: s('saved'),
    discard: s('discard'),
    unsaved: s('unsaved'),
    readOnly: s('readOnly'),
    pairHelp: s('pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, s(`err.${c}`)])),
  });
  const card = (key: ShellCardKey) => {
    const c = screen.cards[key];
    return { key: c.key, value: c.value, version: c.version };
  };
  const sections = [{ value: 'dashboard', label: s('start.dashboard') }, ...START_SECTIONS.filter((x) => x !== 'dashboard').map((x) => ({ value: x, label: t(d, `shell.sec.${x}`) }))];
  const startFields: FieldsCardField[] = screen.roles.map((r) => {
    const stored = String(screen.cards['admin.startPages'].value[r.key] ?? 'dashboard');
    // a section no longer offered (AI Center while its stage is closed) stays shown while it is the stored one
    const options = sections.some((o) => o.value === stored) ? sections : [...sections, { value: stored, label: t(d, `shell.sec.${stored}`) }];
    return { kind: 'select', path: r.key, label: (view.lang === 'bn' ? r.nameBn : r.nameEn) || r.nameEn, options };
  });
  const searchFields: FieldsCardField[] = [
    { kind: 'number', path: 'badgeCacheSeconds', label: s('search.badgeCacheSeconds'), help: s('search.badgeCacheSecondsHelp'), min: 0, max: 600 },
    { kind: 'number', path: 'searchPerGroup', label: s('search.searchPerGroup'), help: s('search.searchPerGroupHelp'), min: 1, max: 20 },
    { kind: 'number', path: 'searchMinChars', label: s('search.searchMinChars'), help: s('search.searchMinCharsHelp'), min: 1, max: 6 },
  ];
  const dashFields: FieldsCardField[] = [
    {
      kind: 'rows',
      path: 'ranges',
      label: s('dash.ranges'),
      help: s('dash.rangesHelp'),
      max: 5,
      add: s('dash.add'),
      remove: s('dash.remove'),
      empty: s('dash.empty'),
      columns: [{ kind: 'number', key: 'days', label: s('dash.days'), min: 1, max: 366 }],
    },
    { kind: 'number', path: 'afternoonHour', label: s('dash.afternoonHour'), min: 0, max: 23 },
    { kind: 'number', path: 'eveningHour', label: s('dash.eveningHour'), help: s('dash.eveningHourHelp'), min: 0, max: 23 },
    { kind: 'number', path: 'sparkDays', label: s('dash.sparkDays'), help: s('dash.sparkDaysHelp'), min: 2, max: 90 },
  ];
  const sw = screen.switches;

  return (
    <div className="a2-z ssx-page" data-testid="ss-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />
      {!canEdit ? (
        <p className="lm-card ssx-ro" role="note" data-testid="ss-readonly">
          {s('readOnly')}
        </p>
      ) : null}
      <section className="lm-card ssx-helpers" aria-labelledby="ss-helpers-h" data-testid="ss-helpers">
        <h2 className="lm-h2" id="ss-helpers-h">
          {s('helpers')}
        </h2>
        <p className="lm-sub">{s('helpersSub')}</p>
        {canEdit ? (
          <SettingCards
            save={{ method: 'PUT', url: API }}
            testId="ss-switches"
            cards={[
              {
                key: 'recentPages',
                title: s('recent'),
                text: s('recentText'),
                on: sw.recentPages.on,
                fields: [{ name: 'count', label: s('recentCount'), kind: 'number', value: sw.recentPages.count, min: 1, max: RECENT_KEPT, step: 1, unit: s('unitPages'), hint: s('recentHint') }],
              },
              { key: 'keyJumps', title: s('keys'), text: s('keysText'), on: sw.keyJumps.on },
            ]}
          />
        ) : (
          <ul className="ssx-ro-list" data-testid="ss-switches-ro">
            <li>
              <b>{s('recent')}</b> <span>{sw.recentPages.on ? s('onCount', { n: sw.recentPages.count }) : s('off')}</span>
            </li>
            <li>
              <b>{s('keys')}</b> <span>{sw.keyJumps.on ? s('on') : s('off')}</span>
            </li>
          </ul>
        )}
      </section>
      {screen.roles.length ? (
        <FieldsCard url={API} screen={card('admin.startPages')} fields={startFields} texts={texts('start')} canEdit={canEdit} testId="ss-start" />
      ) : (
        <p className="lm-card" data-testid="ss-start-none">
          {s('start.none')}
        </p>
      )}
      <FieldsCard url={API} screen={card('admin.shell')} fields={searchFields} texts={texts('search')} canEdit={canEdit} testId="ss-search" />
      <FieldsCard url={API} screen={card('admin.dashboard')} fields={dashFields} texts={texts('dash')} canEdit={canEdit} testId="ss-dash" />
    </div>
  );
}
