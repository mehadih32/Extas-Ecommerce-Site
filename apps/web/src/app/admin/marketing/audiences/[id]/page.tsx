// S13 · PR 262 (Blueprint C6.2 point 3, demo 97u-adm2-customers.js "Segment builder") — /admin/marketing/audiences/<id>
// (`new` for a new one): the audience's name and conditions, the live count of people (a few masked names with
// `customers.read`), and its steps (save, count again, archive, restore). Seeing needs `marketing.audiences.read`,
// changing `marketing.audiences.write`. Guide: docs/admin-guide/pages/marketing/audience.md.
// PR 263: `new?kind=lookalike` makes a lookalike (its seed: the people delivered to in the owner's last N days); an
// existing audience also shows "Send to ad platforms" (AudiencePush: hashed, off until `ads.audiences.push` is on).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AudienceBuilder, type EditorAudience } from '@/components/admin/marketing/AudienceBuilder';
import { AudiencePush, type PushSyncLine } from '@/components/admin/marketing/AudiencePush';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { AUDIENCE_KIND_LOOKALIKE } from '@/lib/marketing/audience-model';
import { audiencesCard, audienceSyncs } from '@/lib/marketing/audience-push';
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

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string }> };

export default async function AudiencePage(props: Props) {
  const deps = adminDeps();
  const [{ id }, plain, sp] = await Promise.all([props.params, adminView(deps), props.searchParams]);
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
  const [a, choices, timeZone, card, syncs] = await Promise.all([
    isNew ? Promise.resolve(null) : audienceOne(access.deps.db, id),
    audienceChoices(access.deps.db, access.deps.resolver),
    access.deps.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID }),
    audiencesCard(access.deps.resolver),
    isNew ? Promise.resolve([]) : audienceSyncs(access.deps.db, id).catch(() => []),
  ]);
  if (!isNew && !a)
    return (
      <div className="a2-z">
        <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={s('editMeta')} />
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const canWrite = access.guard.permissions?.has('marketing.audiences.write') ?? false;
  const when = (iso: string) => new Intl.DateTimeFormat(view.locale, { timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', numberingSystem: 'latn' }).format(new Date(iso));
  const kind: EditorAudience['kind'] = a ? (a.kind === AUDIENCE_KIND_LOOKALIKE ? 'LOOKALIKE' : 'BUILDER') : sp.kind === 'lookalike' ? 'LOOKALIKE' : 'BUILDER';
  const start: EditorAudience = a
    ? { id: a.id, kind, seedDays: a.seedDays, name: a.name, state: a.state, rules: a.rules, countedLine: a.countedAt ? s('countedLine', { when: when(a.countedAt), size: a.size ?? 0 }) : null, campaigns: a.campaigns, version: a.version }
    : { id: null, kind, seedDays: null, name: '', state: 'ACTIVE', rules: [], countedLine: null, campaigns: 0, version: null };
  const syncLines: PushSyncLine[] = syncs.map((x, i) => ({
    key: `${x.platform}-${i}`,
    platform: x.platform,
    account: x.account,
    status: x.status,
    line: [s(`push.saved.${x.status}`, { n: x.memberCount ?? 0 }), x.syncedAt ? s('push.when', { when: when(x.syncedAt) }) : null, x.lookalike ? s('push.lalMade') : null].filter(Boolean).join(' · '),
    error: x.lastError,
  }));
  const words = { au: (d as Record<string, Dict>).au ?? {} } as Dict;
  const grades = choices.grades.map((g) => ({ id: g.id, name: (view.lang === 'bn' && g.nameBn) || g.nameEn }));

  return (
    <div className="a2-z" data-testid="audience-editor">
      <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={a ? a.name : s(kind === 'LOOKALIKE' ? 'lal.newTitle' : 'newTitle')} sub={a ? `${s(`kind.${kind}`)} · ${s(`state.${a.state}`)}` : undefined} />
      <SectionTabs view={view} current={KEY} />
      <AudienceBuilder words={words} audience={start} sizes={choices.sizes} grades={grades} canWrite={canWrite} listHref={LIST} />
      {a ? <AudiencePush words={words} audienceId={a.id} version={a.version} on={card.value.push} canWrite={canWrite} archived={a.state === 'ARCHIVED'} lookalike={kind === 'LOOKALIKE'} syncs={syncLines} settingsHref={`${LIST}#au-settings`} /> : null}
    </div>
  );
}
