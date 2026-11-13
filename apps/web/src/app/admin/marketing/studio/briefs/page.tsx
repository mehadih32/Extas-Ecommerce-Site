// S25 · PR 490 (Blueprint C8.4, C8.6 item 10) — Marketing › Studio › Creative brief at
// /admin/marketing/studio/briefs, on /api/admin/marketing/studio/briefs (lib/studio/brief-admin.ts). Seeing needs
// `marketing.studio.read`; answering a brief, proposing directions, choosing one and setting a brief aside need
// `marketing.studio.write`. The whole Studio tab stays hidden by `stages.closedShown.S25` until the stage is
// finished (CN-036/CN-039). Guide: docs/admin-guide/pages/marketing/studio-briefs.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { CREATIVE_DIRECTION_KEYS, type CreativeDirectionKey } from '@extas/creative-studio';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CreativeBriefActions, CreativeBriefForm, type BriefTexts } from '@/components/admin/studio/CreativeBrief';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { briefsOverview } from '@/lib/studio/brief-admin';
import bn from '../../../../../../messages/admin-marketing-studio.bn.json';
import en from '../../../../../../messages/admin-marketing-studio.en.json';
import '../../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/studio/briefs';
const API = '/api/admin/marketing/studio/briefs';
const KEY = 'marketingStudioBriefs';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'studio.briefs.metaTitle'), robots: { index: false, follow: false } };
}

export default async function CreativeBriefsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.studio.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="brief-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.studio.read" />
      </div>
    );
  const g = (k: string) => t(d, `studio.briefs.${k}`);
  const canWrite = access.guard.permissions?.has('marketing.studio.write') ?? false;
  const errs = Object.fromEntries(['INVALID_INPUT', 'OFF', 'NOT_FOUND', 'WRONG_STATE', 'network', 'other'].map((k) => [k, g(`err.${k}`)]));
  const directionName = Object.fromEntries(CREATIVE_DIRECTION_KEYS.map((k) => [k, g(`directions.${k}.name`)])) as Record<CreativeDirectionKey, string>;
  const directionRationale = Object.fromEntries(CREATIVE_DIRECTION_KEYS.map((k) => [k, g(`directions.${k}.rationale`)])) as Record<CreativeDirectionKey, string>;
  const { briefs, briefEnabled, campaigns, products } = await briefsOverview(access.deps, { db: access.deps.db, settings: access.deps.resolver });
  const texts: BriefTexts = {
    purpose: g('purpose'),
    audience: g('audience'),
    offer: g('offer'),
    durationDays: g('durationDays'),
    products: g('products'),
    noProducts: g('noProducts'),
    campaign: g('campaign'),
    noCampaign: g('noCampaign'),
    draftIt: g('draftIt'),
    drafting: g('drafting'),
    proposeIt: g('proposeIt'),
    proposing: g('proposing'),
    askForMore: g('askForMore'),
    chooseIt: g('chooseIt'),
    choosing: g('choosing'),
    archiveIt: g('archiveIt'),
    archiving: g('archiving'),
    archived: g('archived'),
    directionName,
    directionRationale,
    chosenDirection: g('chosenDirection'),
    err: errs,
  };
  const statusWord = (s: string) => g(`status.${s}`) || s;

  return (
    <div className="a2-z" data-testid="brief-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />

      {!briefEnabled ? (
        <p className="a2-sm a2-mute" data-testid="brief-off-notice">
          {g('offNotice')}
        </p>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="brief-list-h" data-testid="brief-list">
        <h2 className="a2-h3" id="brief-list-h">
          {g('listH')}
        </h2>
        {briefs.length ? (
          <ul className="adp-rules">
            {briefs.map((b) => (
              <li key={b.id} className="adp-rule" data-testid="brief-row" data-status={b.status}>
                <p className="a2-sm adp-sub">
                  {b.answers.purpose} <span className="a2-pill">{statusWord(b.status)}</span>
                </p>
                <p className="a2-sm a2-mute">{g('rowSummary').replace('{offer}', b.answers.offer).replace('{durationDays}', String(b.answers.durationDays))}</p>
                {canWrite ? <CreativeBriefActions url={API} briefId={b.id} status={b.status} answers={b.answers} directions={b.directions} chosenDirection={b.chosenDirection} texts={texts} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{g('empty')}</p>
        )}
      </section>

      {canWrite ? (
        <section className="a2-sc a2-mt12" aria-labelledby="brief-new-h" data-testid="brief-new-section">
          <h2 className="a2-h3" id="brief-new-h">
            {g('newH')}
          </h2>
          <p className="a2-sm a2-mute">{briefEnabled ? g('newD') : g('newDOff')}</p>
          {briefEnabled ? <CreativeBriefForm url={API} campaigns={campaigns} products={products} texts={texts} /> : null}
        </section>
      ) : null}
    </div>
  );
}
