// S25 · PR 487 (Blueprint C8.5) — Marketing › Studio › Campaign exports at /admin/marketing/studio/exports, on
// /api/admin/marketing/studio/exports (lib/studio/export-admin.ts). Seeing needs `marketing.studio.read`; checking a
// selection and preparing an export needs `marketing.studio.write`. The whole Studio tab stays hidden by
// `stages.closedShown.S25` until the stage is finished (CN-036/CN-039). Guide:
// docs/admin-guide/pages/marketing/studio-exports.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { CREATIVE_EXPORT_SIZES, type CreativeExportSize } from '@extas/creative-studio';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CreativeExportActions, CreativeExportForm, type ExportTexts } from '@/components/admin/studio/CreativeExports';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { exportsOverview } from '@/lib/studio/export-admin';
import bn from '../../../../../../messages/admin-marketing-studio.bn.json';
import en from '../../../../../../messages/admin-marketing-studio.en.json';
import '../../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/studio/exports';
const API = '/api/admin/marketing/studio/exports';
const KEY = 'marketingStudioExports';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'studio.exports.metaTitle'), robots: { index: false, follow: false } };
}

export default async function CreativeExportsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.studio.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="export-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.studio.read" />
      </div>
    );
  const g = (k: string) => t(d, `studio.exports.${k}`);
  const canWrite = access.guard.permissions?.has('marketing.studio.write') ?? false;
  const errs = Object.fromEntries(['INVALID_INPUT', 'OFF', 'NOT_FOUND', 'SELECTION_EMPTY', 'WRONG_STATE', 'forbidden', 'network', 'other'].map((k) => [k, g(`err.${k}`)]));
  const sizeName = Object.fromEntries(CREATIVE_EXPORT_SIZES.map((s) => [s, g(`size.${s}`)])) as Record<CreativeExportSize, string>;
  const { exports, exportEnabled, campaigns, categories, adAccounts, canSend } = await exportsOverview(access.deps, { db: access.deps.db, settings: access.deps.resolver }, access.guard.actor);
  const texts: ExportTexts = {
    selectionKind: g('selectionKind'),
    kindProduct: g('kindProduct'),
    kindSku: g('kindSku'),
    kindCategory: g('kindCategory'),
    productId: g('productId'),
    skuId: g('skuId'),
    category: g('category'),
    campaign: g('campaign'),
    noCampaign: g('noCampaign'),
    sizes: g('sizes'),
    sizeName,
    withOverlay: g('withOverlay'),
    landingUrl: g('landingUrl'),
    checkIt: g('checkIt'),
    checking: g('checking'),
    checkCovers: g('checkCovers'),
    requestIt: g('requestIt'),
    requesting: g('requesting'),
    requested: g('requested'),
    archiveIt: g('archiveIt'),
    archiving: g('archiving'),
    archived: g('archived'),
    queueIt: g('queueIt'),
    queuing: g('queuing'),
    runIt: g('runIt'),
    running: g('running'),
    downloadIt: g('downloadIt'),
    downloading: g('downloading'),
    downloaded: g('downloaded'),
    sendIt: g('sendIt'),
    sending: g('sending'),
    sent: g('sent'),
    adAccount: g('adAccount'),
    noAdAccount: g('noAdAccount'),
    err: errs,
  };
  const statusWord = (s: string) => g(`status.${s}`) || s;
  const categoryName = (sel: { kind: string; categoryId?: string; productId?: string; skuId?: string }) => (sel.kind === 'category' ? categories.find((c) => c.id === sel.categoryId)?.name ?? sel.categoryId : sel.kind);

  return (
    <div className="a2-z" data-testid="export-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />

      {!exportEnabled ? (
        <p className="a2-sm a2-mute" data-testid="export-off-notice">
          {g('offNotice')}
        </p>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="export-list-h" data-testid="export-list">
        <h2 className="a2-h3" id="export-list-h">
          {g('listH')}
        </h2>
        {exports.length ? (
          <ul className="adp-rules">
            {exports.map((e) => (
              <li key={e.id} className="adp-rule" data-testid="export-row" data-status={e.status}>
                <p className="a2-sm adp-sub">
                  {categoryName(e.selection)} <span className="a2-pill info">{e.sizes.length} {g('sizesWord')}</span>
                  <span className="a2-pill">{statusWord(e.status)}</span>
                </p>
                <p className="a2-sm a2-mute">{g('rowSummary').replace('{products}', String(e.productCount)).replace('{photos}', String(e.assetCount))}</p>
                {canWrite ? <CreativeExportActions url={API} exportId={e.id} status={e.status} adAccounts={adAccounts} canSend={canSend} texts={texts} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{g('empty')}</p>
        )}
      </section>

      {canWrite ? (
        <section className="a2-sc a2-mt12" aria-labelledby="export-new-h" data-testid="export-new-section">
          <h2 className="a2-h3" id="export-new-h">
            {g('newH')}
          </h2>
          <p className="a2-sm a2-mute">{exportEnabled ? g('newD') : g('newDOff')}</p>
          {exportEnabled ? <CreativeExportForm url={API} categories={categories} campaigns={campaigns} texts={texts} /> : null}
        </section>
      ) : null}
    </div>
  );
}
