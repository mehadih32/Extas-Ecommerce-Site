// S02 · PR 83 — one A/B test at /admin/reports/experiments/<id> (`new` for a new one): its card (result, what B changes,
// previews, steps) and its editor — name and why, what counts, the share of visitors who see B, the last day, and
// version B's parts shown or hidden and words. Only a draft can be changed; a started test keeps what its visitors saw.
// Seeing needs `reports.experiments.read`, writing `reports.experiments.write`. Guide:
// docs/admin-guide/pages/reports/experiment.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ExperimentCard } from '@/components/admin/reports/ExperimentCard';
import { ExperimentEditor, type EditorEye, type EditorTest } from '@/components/admin/reports/ExperimentEditor';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { ExperimentError, experimentOne, moduleCard } from '@/lib/experiments/admin';
import { TESTABLE_EYE } from '@/lib/experiments/model';
import { t, type Dict } from '@/lib/i18n';
import { defaultWord } from '@/lib/website/words';
import eyeBn from '../../../../../../messages/admin-eye.bn.json';
import eyeEn from '../../../../../../messages/admin-eye.en.json';
import bn from '../../../../../../messages/admin-experiments.bn.json';
import en from '../../../../../../messages/admin-experiments.en.json';
import '../../../settings-cards.css';
import '../experiments.css';

export const dynamic = 'force-dynamic';

const LIST = '/admin/reports/experiments';
const KEY = 'reportsExperiment';
const API = '/api/admin/reports/experiments';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'xp.editMeta'), robots: { index: false, follow: false } };
}

/** Every text of the editor, flat (`f.name`, `err.STALE` …). */
function flat(o: Record<string, unknown>, at = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[`${at}${k}`, v]] : Object.entries(flat(v as Record<string, unknown>, `${at}${k}.`)))));
}

export default async function ExperimentPage(props: { params: Promise<{ id: string }> }) {
  const deps = adminDeps();
  const [{ id }, plain] = await Promise.all([props.params, adminView(deps)]);
  const here = `${LIST}/${encodeURIComponent(id)}`;
  const access = await pageAccess('reports.experiments.read', deps, MOTHER_STORE_ID);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z lm-rp" data-lm-ready="" data-testid="xp-one">
        <ShellState view={view} kind="denied" permission="reports.experiments.read" />
      </div>
    );
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `xp.${k}`, vars);
  const crumb = (
    <Link className="bd-crumb" href={LIST} data-testid="xp-back">
      {g('back')}
    </Link>
  );
  const ed = { db: access.deps.db, resolver: access.deps.resolver };
  const isNew = id === 'new';
  const one = isNew
    ? null
    : await experimentOne(ed, id).catch((e: unknown) => {
        if (e instanceof ExperimentError && e.status === 404) return null;
        throw e;
      });
  if (!isNew && !one)
    return (
      <div className="a2-z lm-rp" data-lm-ready="">
        <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={g('editMeta')} />
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const card = one?.card ?? (await moduleCard(ed));
  const canWrite = access.guard.permissions?.has('reports.experiments.write') ?? false;
  const lang = view.lang === 'bn' ? 'bn' : 'en';
  const eyeDict = (lang === 'bn' ? eyeBn : eyeEn).ey;
  const eyeLabels = eyeDict.labels as Record<string, string>;
  const areaLabels = eyeDict.area as Record<string, string>;
  const eyes: EditorEye[] = TESTABLE_EYE.map((e) => ({ id: e.id, label: eyeLabels[e.id] ?? e.id, area: e.area, areaLabel: areaLabels[e.area] ?? e.area }));
  const r = one?.test ?? null;
  const start: EditorTest = r
    ? { id: r.id, version: r.version, name: r.name, note: r.note, goal: r.goal, shareB: r.shareB, endsOn: r.endsOn, eye: r.b.eye, words: r.b.words, shop: Object.fromEntries(Object.keys(r.b.words).map((k) => [k, { en: defaultWord('en', k), bn: defaultWord('bn', k) }])) }
    : { id: null, version: null, name: '', note: '', goal: 'addToBag', shareB: 50, endsOn: null, eye: {}, words: {}, shop: {} };
  const editable = canWrite && (!r || (r.status === 'DRAFT' && !r.archived));
  const texts = flat((lang === 'bn' ? bn : en).xp as unknown as Record<string, unknown>);

  return (
    <div className="a2-z lm-rp" data-lm-ready="" data-testid="xp-one">
      <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={r ? r.name : g('newTitle')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note a2-mt12" role="note">
        <span>{g('note')}</span>
      </div>
      {card.value.enabled ? null : <p className="a2-xs xpb-warn xpb-mt6">{g('moduleOff')}</p>}
      {r ? <ExperimentCard r={r} g={g} lang={lang} eyeLabels={eyeLabels} need={card.value.confidence} min={card.value.minVisitors} canWrite={canWrite} api={API} shopHome={lang === 'bn' ? '/bn' : '/'} /> : null}
      {r && r.status !== 'DRAFT' ? <p className="a2-sm a2-mute a2-mt12">{g('notDraft')}</p> : null}
      <ExperimentEditor key={r?.version ?? 'new'} api={API} listHref={LIST} test={start} eyes={eyes} texts={texts} canEdit={editable} />
    </div>
  );
}
