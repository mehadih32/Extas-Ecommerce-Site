// PR 1020 (D12, owner order: the real admin equals prototype v5 100%): this is now the one Team & roles page of the prototype
// (m-settings.js renderTeam): Invite staff, the staff table, the role tick-tree with Special permissions, Staff limits and the
// end-of-day handover. The old Roles and Staff controls addresses lead here. Each part checks its own permission again.
// S28 · PR 705 — Settings → People at /admin/settings/people: the staff list with roles, status and 2-step login; add, suspend,
// archive, give or take a role. Seeing it needs `staff.read`; changing needs `staff.manage` (the routes check it again).
// Guide: docs/admin-guide/pages/settings/people.md. Words: messages/admin-people.*.json (people), admin-staff-controls.*.json.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePermission } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { ymdIn } from '@extas/metrics';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { InviteStaff } from '@/components/admin/people/InviteStaff';
import { PeopleScreen } from '@/components/admin/people/PeopleScreen';
import { RolesScreen } from '@/components/admin/people/RolesScreen';
import { moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { StaffControlsScreen, type DeskRow } from '@/components/admin/staff/StaffControlsScreen';
import { locateKey } from '@/lib/admin-shell/sections';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { t, type Dict } from '@/lib/i18n';
import { peopleView, rolesView } from '@/lib/people';
import { EXPORT_KEYS, expectedTaken, handoverSheet, staffControlsView } from '@/lib/staff-controls';
import bn from '../../../../../messages/admin-people.bn.json';
import en from '../../../../../messages/admin-people.en.json';
import scBn from '../../../../../messages/admin-staff-controls.bn.json';
import scEn from '../../../../../messages/admin-staff-controls.en.json';
import '../../s28.css';
import '../../settings-cards.css';
import './team.css';

export const dynamic = 'force-dynamic';
const HERE = '/admin/settings/people';
const KEY = 'people';

function withScreen(view: AdminView): AdminView {
  const isBn = view.lang === 'bn';
  return { ...view, dict: { ...view.dict, people: ((isBn ? bn : en).people as unknown) as Dict, staffControls: ((isBn ? scBn : scEn).staffControls as unknown) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'people.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function PeoplePage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('staff.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="people" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="people-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="staff.read" />
      </div>
    );
  const d = access.deps;
  const storeId = MOTHER_STORE_ID;
  const can = async (k: 'staff.manage' | 'roles.manage' | 'settings.write') => {
    try {
      await requirePermission(d.db, access.guard.actor, k, { storeId });
      return true;
    } catch {
      return false;
    }
  };
  const [v, canManage, canRoles, canEdit] = await Promise.all([peopleView(d.db, access.guard.actor), can('staff.manage'), can('roles.manage'), can('settings.write')]);
  // The role tick-tree needs `roles.read`; without it that card is left out (the page still opens for `staff.read`, as before).
  const [rolesV, defaults] = await Promise.all([rolesView(d.db, access.guard.actor).catch(() => null), d.resolver.value('roles.defaultAccess')]);
  const [sc, currency, tz] = await Promise.all([staffControlsView(d, storeId), d.resolver.value('store.currency', { storeId }), d.resolver.value('store.timeZone', { storeId })]);
  const nowMs = (d.now ? d.now() : new Date()).getTime();
  const today = ymdIn(new Date(nowMs), tz);
  const sheet = await handoverSheet(d.db, storeId, today);
  const lang = view.lang === 'bn' ? 'bn' : 'en';
  // Desk staff for the handover table: active people with a role who are not the owner and not a packer (the prototype's "desk staff").
  const deskPeople = v.people.filter((x) => x.status === 'ACTIVE' && x.roles.length > 0 && !x.roles.some((r) => r.key === 'owner' || r.key === 'packer'));
  const desk: DeskRow[] = await Promise.all(
    deskPeople.map(async (x) => {
      const exp = await expectedTaken(d.db, storeId, x.id, today, tz);
      const mine = sheet.rows.filter((r) => r.staffUserId === x.id);
      const got = (m: 'CASH' | 'WALLET') => mine.find((r) => r.method === m)?.countedMinor ?? null;
      const r0 = x.roles[0]!;
      return { id: x.id, name: x.name, roleName: lang === 'bn' ? r0.nameBn : r0.nameEn, expectedCash: exp.CASH, expectedWallet: exp.WALLET, got: { CASH: got('CASH'), WALLET: got('WALLET') } };
    }),
  );
  return (
    <div className="a2-z lm-st" data-testid="people-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(view.dict, 'people.title')} sub={t(view.dict, 'people.sub')} right={canManage ? <InviteStaff dict={view.dict} lang={lang} roles={v.roles} /> : null} />
      <SectionTabs view={view} current={KEY} />
      <PeopleScreen dict={view.dict} lang={lang} view={v} canManage={canManage} me={access.guard.actor.staffUserId} now={nowMs} />
      {rolesV ? (
        <div id="roles" data-testid="roles-block">
          <RolesScreen dict={view.dict} lang={lang} view={rolesV} canManage={canRoles} defaults={defaults} />
        </div>
      ) : null}
      <div id="staff-limits">
        <StaffControlsScreen dict={view.dict} money={moneyOf(currency, view.locale)} view={sc} canEdit={canEdit} canMakeRole={canRoles} canManage={canManage} day={today} today={today} sheet={sheet} desk={desk} exportKeys={EXPORT_KEYS} />
      </div>
    </div>
  );
}
