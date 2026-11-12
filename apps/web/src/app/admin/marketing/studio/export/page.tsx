// S25 · PR 487 (Blueprint C8.1, C8.5) — Marketing › Studio › Export at /admin/marketing/studio/export, on
// /api/admin/marketing/studio/export (lib/studio/export-admin.ts). Seeing needs `marketing.studio.read`;
// requesting or cancelling an export needs `marketing.studio.write`. The whole Studio tab stays hidden by
// `stages.closedShown.S25` until the stage is finished (CN-036/CN-039). Guide:
// docs/admin-guide/pages/marketing/studio-export.md. Producing the actual sized files (PR 488) adds its own button
// here without touching this page's request/cancel flow — nothing is composited yet.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { CREATIVE_EXPORT_SIZES, type CreativeExportSize } from '@extas/creative-studio';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ExportCancel, ExportRequestForm, type ExportTexts } from '@/components/admin/studio/ExportBuilder';
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

const HERE = '/admin/marketing/studio/export';
const API = '/api/admin/marketing/studio/export';
const KEY = 'marketingStudioExport';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'studio.export.metaTitle'), robots: { index: false, follow: false } };
}

export default async function ExportPage() {
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
  const g = (k: string) => t(d, `studio.export.${k}`);
  const canWrite = access.guard.permissions?.has('marketing.studio.write') ?? false;
  const errs = Object.fromEntries(['INVALID_INPUT', 'NOT_FOUND', 'SELECTION_EMPTY', 'SOURCE_INVALID', 'WRONG_STATE', 'network', 'other'].map((k) => [k, g(`err.${k}`)]));
  const sizeName = Object.fromEntries(CREATIVE_EXPORT_SIZES.map((s) => [s, g(`size.${s.replace(/[.-]/g, '')}`)])) as Record<CreativeExportSize, string>;
  const { exports } = await exportsOverview({ db: access.deps.db });
  const texts: ExportTexts = {
    kind: g('kind'),
    kindProduct: g('kindProduct'),
    kindVariant: g('kindVariant'),
    kindCategory: g('kindCategory'),
    idLabel: g('idLabel'),
    idPh: g('idPh'),
    sizes: g('sizes'),
    sizeName,
    withOverlay: g('withOverlay'),
    landingUrl: g('landingUrl'),
    landingUrlPh: g('landingUrlPh'),
    campaignId: g('campaignId'),
    campaignIdPh: g('campaignIdPh'),
    request: g('request'),
    requesting: g('requesting'),
    requested: g('requested'),
    cancel: g('cancel'),
    cancelling: g('cancelling'),
    err: errs,
  };
  const statusWord = (s: string) => g(`status.${s}`) || s;
  const selectionWord = (sel: { productId: string | null; variantId: string | null; categoryId: string | null }) =>
    sel.productId ? `${g('kindProduct')} · ${sel.productId.slice(0, 8)}` : sel.variantId ? `${g('kindVariant')} · ${sel.variantId.slice(0, 8)}` : sel.categoryId ? `${g('kindCategory')} · ${sel.categoryId.slice(0, 8)}` : '—';

  return (
    <div className="a2-z" data-testid="export-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />

      <section className="a2-sc a2-mt12" aria-labelledby="export-list-h" data-testid="export-list">
        <h2 className="a2-h3" id="export-list-h">
          {g('listH')}
        </h2>
        {exports.length ? (
          <ul className="adp-rules">
            {exports.map((e) => (
              <li key={e.id} className="adp-rule" data-testid="export-row" data-status={e.status}>
                <p className="a2-sm adp-sub">
                  {selectionWord(e.selection)} <span className="a2-pill">{statusWord(e.status)}</span>
                </p>
                <p className="a2-sm a2-mute">{e.sizes.map((s) => sizeName[s]).join(', ')}</p>
                {canWrite && e.status === 'DRAFT' ? <ExportCancel url={API} exportId={e.id} texts={texts} /> : null}
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
          <p className="a2-sm a2-mute">{g('newD')}</p>
          <ExportRequestForm url={API} texts={texts} />
        </section>
      ) : null}
    </div>
  );
}
