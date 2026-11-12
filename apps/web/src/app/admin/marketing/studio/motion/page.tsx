// S25 · PR 481 (Blueprint C8.1) — Marketing › Studio › Motion library at /admin/marketing/studio/motion, on
// /api/admin/marketing/studio/motion (lib/studio/motion-admin.ts). Seeing needs `marketing.studio.read`; adding,
// editing and archiving needs `marketing.studio.write`. The whole Studio tab stays hidden by `stages.closedShown.S25`
// until the stage is finished (CN-036/CN-039). Guide: docs/admin-guide/pages/marketing/studio-motion.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { listMotionActions, MOTION_GARMENT_HINTS } from '@extas/creative-studio';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { MotionArchive, MotionNew, type MotionTexts } from '@/components/admin/studio/MotionLibrary';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../messages/admin-marketing-studio.bn.json';
import en from '../../../../../../messages/admin-marketing-studio.en.json';
import '../../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/studio/motion';
const API = '/api/admin/marketing/studio/motion';
const KEY = 'marketingStudioMotion';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'studio.metaTitle'), robots: { index: false, follow: false } };
}

export default async function MotionLibraryPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.studio.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="motion-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.studio.read" />
      </div>
    );
  const g = (k: string) => t(d, `studio.motion.${k}`);
  const canWrite = access.guard.permissions?.has('marketing.studio.write') ?? false;
  const errs = Object.fromEntries(['INVALID_INPUT', 'CONFLICT', 'NOT_FOUND', 'network', 'other'].map((k) => [k, g(`err.${k}`)]));
  const hint = Object.fromEntries(MOTION_GARMENT_HINTS.map((h) => [h, g(`hint.${h}`)])) as MotionTexts['hint'];
  const texts: MotionTexts = {
    name: g('name'),
    nameBn: g('nameBn'),
    garmentHint: g('garmentHint'),
    descriptionEn: g('descriptionEn'),
    descriptionBn: g('descriptionBn'),
    groupClip: g('groupClip'),
    add: g('add'),
    adding: g('adding'),
    added: g('added'),
    archive: g('archive'),
    restore: g('restore'),
    confirmArchive: g('confirmArchive'),
    yes: g('yes'),
    cancel: g('cancel'),
    hint,
    err: errs,
  };
  const actions = await listMotionActions({ db: access.deps.db }, MOTHER_STORE_ID);
  const name = (a: (typeof actions)[number]) => (view.lang === 'bn' ? a.spec.nameBn : a.name);
  const desc = (a: (typeof actions)[number]) => (view.lang === 'bn' ? a.spec.descriptionBn : a.spec.descriptionEn);

  return (
    <div className="a2-z" data-testid="motion-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />

      <section className="a2-sc a2-mt12" aria-labelledby="motion-list-h" data-testid="motion-list">
        <h2 className="a2-h3" id="motion-list-h">
          {g('listH')}
        </h2>
        {actions.length ? (
          <ul className="adp-rules">
            {actions.map((a) => (
              <li key={a.id} className="adp-rule" data-testid="motion-row" data-key={a.key} data-archived={a.archived}>
                <p className="a2-sm adp-sub">
                  {name(a)} <span className="a2-pill info">{hint[a.spec.garmentHint]}</span>
                  {a.archived ? <span className="a2-pill line">{g('archived')}</span> : null}
                  {a.sharedWithAllStores ? <span className="a2-pill">{g('shared')}</span> : <span className="a2-pill">{g('own')}</span>}
                </p>
                <p className="a2-sm a2-mute">{desc(a)}</p>
                {canWrite ? (
                  <div className="adp-read">
                    <MotionArchive url={API} action={a} texts={texts} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{g('empty')}</p>
        )}
      </section>

      {canWrite ? (
        <section className="a2-sc a2-mt12" aria-labelledby="motion-new-h" data-testid="motion-new-section">
          <h2 className="a2-h3" id="motion-new-h">
            {g('newH')}
          </h2>
          <p className="a2-sm a2-mute">{g('newD')}</p>
          <MotionNew url={API} texts={texts} />
        </section>
      ) : null}
    </div>
  );
}
