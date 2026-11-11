// S23 · PR 437, 438 (Blueprint C5 · Social & content studio) — Marketing › Studio at /admin/marketing/studio: the
// social accounts (PR 437: add, rename, switch, approval, daily limit, archive/restore), the brand asset library
// and the templates (PR 438: add, update, archive/restore). The video assembly engine, the publishing adapters, the
// calendar/approval queue and the comment/DM ingestion (PR 439–443) join this page as they are built. Seeing needs
// `studio.read`; changing needs `studio.write` (the API checks again). Hidden from the menu by
// `stages.closedShown.S23` until the stage is finished (CN-036/CN-039), but this address works once you have it.
// lib/marketing/studio.ts. Guide: docs/admin-guide/pages/marketing/studio.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { BRAND_ASSET_KINDS, STUDIO_PLATFORMS, TEMPLATE_ASPECT_RATIOS, TEMPLATE_KINDS } from '@extas/studio';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { altFor, ResponsiveImage } from '@/components/media/ResponsiveImage';
import { StudioAccountForm, StudioAccountLimit, StudioAct, StudioAssetKind, StudioAssetUpload, StudioTemplateForm, type StudioFormTexts } from '@/components/admin/marketing/StudioForms';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { studioOverview } from '@/lib/marketing/studio';
import bn from '../../../../../messages/admin-marketing-studio.bn.json';
import en from '../../../../../messages/admin-marketing-studio.en.json';
import '../../settings-cards.css';
import '../../messages/email/email.css';
import '../ad-platforms/ad-platforms.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/studio';
const KEY = 'marketingStudio';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'studio.hub.metaTitle'), robots: { index: false, follow: false } };
}

export default async function StudioPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('studio.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="studio-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="studio.read" />
      </div>
    );
  const o = await studioOverview(access.deps, { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx });
  const canWrite = access.guard.permissions?.has('studio.write') ?? false;
  // Uploading to the brand asset library also needs the Media library's own permission, re-checked by /api/admin/media.
  const canUploadMedia = access.guard.permissions?.has('media.upload') ?? false;
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `studio.hub.${k}`, vars);
  const errKeys = ['INVALID_INPUT', 'NOT_FOUND', 'STALE', 'ALREADY_ADDED', 'TEMPLATE_ARCHIVED', 'TOO_LARGE', 'NOT_AN_IMAGE', 'TYPE_NOT_ALLOWED', 'STILL_IN_USE', 'forbidden', 'unauthorized', 'network', 'other'];
  const err = Object.fromEntries(errKeys.map((k) => [k, g(`err.${k}`)]));
  const texts: StudioFormTexts = { err, fields: Object.fromEntries(['platform', 'externalId', 'name', 'kind', 'dailyLimit', 'spec', 'assetId'].map((k) => [k, g(`f.${k}`)])) };
  const platforms = STUDIO_PLATFORMS.map((p) => ({ id: p, label: g(`platforms.${p}`) }));
  const kinds = TEMPLATE_KINDS.map((k) => ({ id: k, label: g(`templateKinds.${k}`) }));
  const assetKinds = BRAND_ASSET_KINDS.map((k) => ({ id: k, label: g(`assetKinds.${k}`) }));
  const liveAccounts = o.accounts.filter((a) => !a.archived);

  return (
    <div className="a2-z" data-testid="studio-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note yt-mt8" role="note">
        <span>{g('note')}</span>
      </div>

      <section className="a2-sc a2-mt12" aria-labelledby="st-acc-h" data-testid="st-accounts">
        <h2 className="a2-h3" id="st-acc-h">
          {g('accounts.h')}
        </h2>
        <p className="a2-sm a2-mute">{g('accounts.d')}</p>
        {o.accounts.length ? (
          <ul className="adp-rules">
            {o.accounts.map((a) => (
              <li key={a.id} className="adp-rule" data-testid="st-account">
                <p className="a2-sm adp-sub">
                  {a.name} {a.archived ? <span className="a2-pill line">{g('accounts.archived')}</span> : <span className={`a2-pill ${a.enabled ? 'ok' : 'line'}`}>{g(a.enabled ? 'accounts.on' : 'accounts.off')}</span>}
                  {!a.archived ? <span className={`a2-pill ${a.requireApproval ? 'line' : 'warn'}`}>{g(a.requireApproval ? 'accounts.needsApproval' : 'accounts.free')}</span> : null}
                </p>
                <p className="a2-sm a2-mute">
                  {g(`platforms.${a.platform}`)} · {a.externalId}
                </p>
                {!a.archived ? (
                  <p className="a2-sm a2-mute">{a.dailyLimit === null ? g('accounts.noLimit') : g('accounts.limit', { n: a.dailyLimit })}</p>
                ) : null}
                {canWrite && !a.archived ? (
                  <span className="a2-gap8 yt-mt8">
                    <StudioAct texts={texts} body={{ action: 'account.switch', id: a.id, enabled: !a.enabled, version: a.version }} label={g(a.enabled ? 'accounts.turnOff' : 'accounts.turnOn')} testId="st-account-switch" done={g('accounts.saved')} />
                    <StudioAct texts={texts} body={{ action: 'account.requireApproval', id: a.id, requireApproval: !a.requireApproval, version: a.version }} label={g(a.requireApproval ? 'accounts.letRunFree' : 'accounts.askApproval')} testId="st-account-approval" done={g('accounts.saved')} />
                    <StudioAccountLimit texts={texts} id={a.id} version={a.version} dailyLimit={a.dailyLimit} w={{ label: g('accounts.limitPh'), save: g('accounts.limitSave'), saved: g('accounts.saved') }} />
                  </span>
                ) : null}
                {canWrite ? (
                  <span className="a2-gap8 yt-mt8">
                    <StudioAct texts={texts} body={{ action: 'account.archive', id: a.id, archived: !a.archived, version: a.version }} label={g(a.archived ? 'accounts.restore' : 'accounts.archive')} testId="st-account-archive" done={g('accounts.saved')} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute yt-mt8">{g('accounts.empty')}</p>
        )}
        {canWrite ? (
          <details className="a2-mt12 a2-more-opts" data-testid="st-add-account" open={!o.accounts.length}>
            <summary className="a2-sm a2-b">{g('accounts.addH')}</summary>
            <StudioAccountForm texts={texts} platforms={platforms} w={{ platform: g('f.platform'), externalId: g('f.externalId'), externalIdPh: g('accounts.externalIdPh'), name: g('f.name'), namePh: g('accounts.namePh'), add: g('accounts.add'), added: g('accounts.added') }} />
          </details>
        ) : null}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="st-tpl-h" data-testid="st-templates">
        <h2 className="a2-h3" id="st-tpl-h">
          {g('templates.h')}
        </h2>
        <p className="a2-sm a2-mute">{g('templates.d')}</p>
        {o.templates.length ? (
          <ul className="adp-rules">
            {o.templates.map((tpl) => (
              <li key={tpl.id} className="adp-rule" data-testid="st-template">
                <p className="a2-sm adp-sub">
                  {tpl.name} {tpl.archived ? <span className="a2-pill line">{g('templates.archived')}</span> : null}
                </p>
                <p className="a2-sm a2-mute">
                  {g(`templateKinds.${tpl.kind}`)} · {tpl.spec.aspectRatio}
                  {tpl.spec.durationSeconds ? ` · ${g('templates.seconds', { n: tpl.spec.durationSeconds })}` : ''} · {g('templates.version', { n: tpl.version })}
                </p>
                {canWrite ? (
                  <span className="a2-gap8 yt-mt8">
                    <StudioAct texts={texts} body={{ action: 'template.archive', id: tpl.id, archived: !tpl.archived, version: tpl.updatedAt }} label={g(tpl.archived ? 'templates.restore' : 'templates.archive')} testId="st-template-archive" done={g('accounts.saved')} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute yt-mt8">{g('templates.empty')}</p>
        )}
        {canWrite ? (
          <details className="a2-mt12 a2-more-opts" data-testid="st-add-template" open={!o.templates.length}>
            <summary className="a2-sm a2-b">{g('templates.addH')}</summary>
            <StudioTemplateForm
              texts={texts}
              kinds={kinds}
              ratios={[...TEMPLATE_ASPECT_RATIOS]}
              w={{ kind: g('f.kind'), name: g('f.name'), namePh: g('templates.namePh'), aspectRatio: g('templates.aspectRatio'), duration: g('templates.duration'), notes: g('templates.notes'), notesPh: g('templates.notesPh'), add: g('templates.add'), added: g('templates.added') }}
            />
          </details>
        ) : null}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="st-ast-h" data-testid="st-assets">
        <h2 className="a2-h3" id="st-ast-h">
          {g('assets.h')}
        </h2>
        <p className="a2-sm a2-mute">{g('assets.d')}</p>
        {o.assets.length ? (
          <ul className="adp-rules">
            {o.assets.map((a) => {
              const img = o.images[a.id];
              return (
                <li key={a.id} className="adp-rule" data-testid="st-asset">
                  {img ? (
                    <span style={{ display: 'inline-block', width: 72 }}>
                      <ResponsiveImage image={img} slot="thumb" sizes="72px" alt={altFor(img, view.lang, a.name ?? '')} />
                    </span>
                  ) : null}
                  <p className="a2-sm adp-sub">
                    {a.name ?? a.id} {a.archived ? <span className="a2-pill line">{g('assets.archived')}</span> : null}
                  </p>
                  {canWrite && !a.archived ? <StudioAssetKind texts={texts} assetId={a.id} kind={a.kind} kinds={assetKinds} clearLabel={g('assets.noKind')} /> : a.kind ? <p className="a2-sm a2-mute">{g(`assetKinds.${a.kind}`)}</p> : null}
                  {canWrite ? (
                    <span className="a2-gap8 yt-mt8">
                      <StudioAct texts={texts} body={{ action: a.archived ? 'asset.restore' : 'asset.archive', assetId: a.id, archived: !a.archived, reason: 'studio: এই অ্যাসেট আর ব্যবহার হচ্ছে না' }} label={g(a.archived ? 'assets.restore' : 'assets.archive')} testId="st-asset-archive" done={g('accounts.saved')} />
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="a2-sm a2-mute yt-mt8">{g('assets.empty')}</p>
        )}
        {canWrite ? (
          <details className="a2-mt12 a2-more-opts" data-testid="st-add-asset" open={!o.assets.length}>
            <summary className="a2-sm a2-b">{g('assets.addH')}</summary>
            <StudioAssetUpload texts={texts} kinds={assetKinds} canUpload={canUploadMedia} w={{ file: g('assets.file'), kind: g('f.kind'), add: g('assets.add'), added: g('assets.added'), needMedia: g('assets.needMedia') }} />
          </details>
        ) : null}
      </section>
    </div>
  );
}
