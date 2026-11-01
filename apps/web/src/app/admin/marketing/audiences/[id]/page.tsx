// S13 · PR 262 (Blueprint C6.2 point 3, demo 97u-adm2-customers.js "Segment builder") — /admin/marketing/audiences/<id>
// (`new` for a new one): the audience's name and conditions, the live count of people (a few masked names with
// `customers.read`), and its steps (save, count again, archive, restore). Seeing needs `marketing.audiences.read`,
// changing `marketing.audiences.write`. Nothing here sends a list to an ad platform. Guide:
// docs/admin-guide/pages/marketing/audience.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AudienceBuilder, type EditorAudience } from '@/components/admin/marketing/AudienceBuilder';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { audienceChoices, audienceOne } from '@/lib/marketing/audiences';
import bn from '../../../../../../messages/admin-audiences.bn.json';
import en from '../../../../../../messages/admin-audiences.en.json';
import '../../../settings-cards.css';
import '../../landing/landing.css';
import '../audiences.css';

export const dynamic = 'force-dynamic';

const LIST = '/admin/marketing/audiences';
const KEY = 'marketingAudience';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'au.editMeta'), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ id: string }> };

export default async function AudiencePage(props: Props) {
  const deps = adminDeps();
  const [{ id }, plain] = await Promise.all([props.params, adminView(deps)]);
  const here = `${LIST}/${encodeURIComponent(id)}`;
  const access = await pageAccess('marketing.audiences.read', deps, MOTHER_STORE_ID);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="marketing.audiences.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `au.${k}`, vars);
  const crumb = (
    <Link className="bd-crumb" href={LIST} data-testid="au-back">
      {s('back')}
    </Link>
  );
  const isNew = id === 'new';
  const [a, choices, timeZone] = await Promise.all([isNew ? Promise.resolve(null) : audienceOne(access.deps.db, id), audienceChoices(access.deps.db, access.deps.resolver), access.deps.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID })]);
  if (!isNew && !a)
    return (
      <div className="a2-z">
        <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={s('editMeta')} />
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const canWrite = access.guard.permissions?.has('marketing.audiences.write') ?? false;
  const when = (iso: string) => new Intl.DateTimeFormat(view.locale, { timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', numberingSystem: 'latn' }).format(new Date(iso));
  const start: EditorAudience = a
    ? { id: a.id, name: a.name, state: a.state, rules: a.rules, countedLine: a.countedAt ? s('countedLine', { when: when(a.countedAt), size: a.size ?? 0 }) : null, campaigns: a.campaigns, version: a.version }
    : { id: null, name: '', state: 'ACTIVE', rules: [], countedLine: null, campaigns: 0, version: null };
  const words = { au: (d as Record<string, Dict>).au ?? {} } as Dict;
  const grades = choices.grades.map((g) => ({ id: g.id, name: (view.lang === 'bn' && g.nameBn) || g.nameEn }));

  return (
    <div className="a2-z" data-testid="audience-editor">
      <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={a ? a.name : s('newTitle')} sub={a ? s(`state.${a.state}`) : undefined} />
      <SectionTabs view={view} current={KEY} />
      <AudienceBuilder words={words} audience={start} sizes={choices.sizes} grades={grades} canWrite={canWrite} listHref={LIST} />
    </div>
  );
}
