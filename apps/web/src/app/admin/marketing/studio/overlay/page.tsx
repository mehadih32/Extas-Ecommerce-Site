// S25 · PR 489 (Blueprint C8.3) — Marketing › Studio › Campaign overlays at /admin/marketing/studio/overlay, on
// /api/admin/marketing/studio/overlay (lib/studio/overlay-admin.ts). Seeing needs `marketing.studio.read`; adding,
// editing, enabling and archiving needs `marketing.studio.write`. The whole Studio tab stays hidden by
// `stages.closedShown.S25` until the stage is finished (CN-036/CN-039). Guide:
// docs/admin-guide/pages/marketing/studio-overlay.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { OVERLAY_TEMPLATES } from '@extas/creative-studio';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { OverlayArchive, OverlayEnable, OverlayNew, type OverlayTexts } from '@/components/admin/studio/CampaignOverlays';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { overlayOverview } from '@/lib/studio/overlay-admin';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../messages/admin-marketing-studio.bn.json';
import en from '../../../../../../messages/admin-marketing-studio.en.json';
import '../../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/studio/overlay';
const API = '/api/admin/marketing/studio/overlay';
const KEY = 'marketingStudioOverlay';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'studio.overlay.metaTitle'), robots: { index: false, follow: false } };
}

export default async function CampaignOverlaysPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.studio.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="overlay-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.studio.read" />
      </div>
    );
  const g = (k: string) => t(d, `studio.overlay.${k}`);
  const canWrite = access.guard.permissions?.has('marketing.studio.write') ?? false;
  const errs = Object.fromEntries(['INVALID_INPUT', 'CONFLICT', 'NOT_FOUND', 'WINDOW_INVALID', 'network', 'other'].map((k) => [k, g(`err.${k}`)]));
  const template = Object.fromEntries(OVERLAY_TEMPLATES.map((k) => [k, g(`template.${k}`)])) as OverlayTexts['template'];
  const texts: OverlayTexts = {
    campaign: g('campaign'),
    noCampaign: g('noCampaign'),
    templateLabel: g('templateLabel'),
    template,
    labelEn: g('labelEn'),
    labelBn: g('labelBn'),
    accent: g('accent'),
    reach: g('reach'),
    reachAll: g('reachAll'),
    reachProducts: g('reachProducts'),
    reachCategories: g('reachCategories'),
    slugsHelp: g('slugsHelp'),
    startsAt: g('startsAt'),
    endsAt: g('endsAt'),
    add: g('add'),
    adding: g('adding'),
    added: g('added'),
    enable: g('enable'),
    disable: g('disable'),
    archive: g('archive'),
    restore: g('restore'),
    confirmArchive: g('confirmArchive'),
    yes: g('yes'),
    cancel: g('cancel'),
    archived: g('archived'),
    enabled: g('enabled'),
    disabled: g('disabled'),
    empty: g('empty'),
    err: errs,
  };
  const { overlays, campaigns } = await overlayOverview({ db: access.deps.db });
  const campaignName = (id: string | null) => (id ? campaigns.find((c) => c.id === id)?.name ?? g('noCampaign') : g('noCampaign'));
  const reachWords = (o: (typeof overlays)[number]) =>
    o.appliesTo.kind === 'all' ? texts.reachAll : o.appliesTo.kind === 'products' ? `${texts.reachProducts}: ${o.appliesTo.slugs.join(', ')}` : `${texts.reachCategories}: ${o.appliesTo.slugs.join(', ')}`;

  return (
    <div className="a2-z" data-testid="overlay-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />

      <section className="a2-sc a2-mt12" aria-labelledby="overlay-list-h" data-testid="overlay-list">
        <h2 className="a2-h3" id="overlay-list-h">
          {g('listH')}
        </h2>
        {overlays.length ? (
          <ul className="adp-rules">
            {overlays.map((o) => (
              <li key={o.id} className="adp-rule" data-testid="overlay-row" data-id={o.id} data-archived={o.archived} data-enabled={o.enabled}>
                <p className="a2-sm adp-sub">
                  {view.lang === 'bn' ? o.design.labelBn : o.design.labelEn} <span className="a2-pill info">{template[o.templateKey]}</span>
                  <span className="a2-pill" style={{ background: o.design.accent, color: 'var(--lm-on-ac)' }}>
                    {campaignName(o.campaignId)}
                  </span>
                  {o.archived ? <span className="a2-pill line">{texts.archived}</span> : <span className="a2-pill">{o.enabled ? texts.enabled : texts.disabled}</span>}
                </p>
                <p className="a2-sm a2-mute">{reachWords(o)}</p>
                {o.startsAt || o.endsAt ? (
                  <p className="a2-sm a2-mute" data-testid="overlay-window">
                    {o.startsAt ? new Date(o.startsAt).toLocaleString(view.lang === 'bn' ? 'bn-BD' : 'en-US') : '—'} → {o.endsAt ? new Date(o.endsAt).toLocaleString(view.lang === 'bn' ? 'bn-BD' : 'en-US') : '—'}
                  </p>
                ) : null}
                {canWrite ? (
                  <div className="adp-read">
                    {!o.archived ? <OverlayEnable url={API} overlay={o} texts={texts} /> : null}
                    <OverlayArchive url={API} overlay={o} texts={texts} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{texts.empty}</p>
        )}
      </section>

      {canWrite ? (
        <section className="a2-sc a2-mt12" aria-labelledby="overlay-new-h" data-testid="overlay-new-section">
          <h2 className="a2-h3" id="overlay-new-h">
            {g('newH')}
          </h2>
          <p className="a2-sm a2-mute">{g('newD')}</p>
          <OverlayNew url={API} campaigns={campaigns} texts={texts} />
        </section>
      ) : null}
    </div>
  );
}
