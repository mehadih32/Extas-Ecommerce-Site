// S24 · PR 445 (Blueprint C7.16 "Model library screen") — Marketing › Studio › Model library at
// /admin/marketing/studio/models (lib/marketing/studio-models.ts). Seeing needs `photoshoot.read`; adding a model,
// editing it, archiving/restoring it, linking/unlinking a reference photo and recording consent all need
// `photoshoot.write`. The whole Studio tab stays hidden by `stages.closedShown.S24` (shared with S23/S25) until all
// three are finished (CN-036/CN-039), but this address works once you have it.
// Guide: docs/admin-guide/pages/marketing/studio-models.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { MODEL_ANGLES, MODEL_KINDS, type ModelAngle, type ModelKind } from '@extas/photoshoot';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ModelArchive, ModelAssetAdd, ModelAssetRemove, ModelConsentAdd, ModelNew, type ModelTexts } from '@/components/admin/marketing/ModelLibrary';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { modelsOverview } from '@/lib/marketing/studio-models';
import bn from '../../../../../../messages/admin-marketing-studio.bn.json';
import en from '../../../../../../messages/admin-marketing-studio.en.json';
import '../../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/studio/models';
const API = '/api/admin/marketing/studio/models';
const KEY = 'marketingStudioModels';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'studio.models.metaTitle'), robots: { index: false, follow: false } };
}

export default async function ModelLibraryPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('photoshoot.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="model-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="photoshoot.read" />
      </div>
    );
  const g = (k: string) => t(d, `studio.models.${k}`);
  const canWrite = access.guard.permissions?.has('photoshoot.write') ?? false;
  const errs = Object.fromEntries(['INVALID_INPUT', 'NOT_FOUND', 'SOURCE_INVALID', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, g(`err.${k}`)]));
  const kinds = Object.fromEntries(MODEL_KINDS.map((k) => [k, g(`kinds.${k}`)])) as Record<ModelKind, string>;
  const angles = Object.fromEntries(MODEL_ANGLES.map((a) => [a, g(`angles.${a}`)])) as Record<ModelAngle, string>;
  const texts: ModelTexts = {
    name: g('name'),
    gender: g('gender'),
    ageGroup: g('ageGroup'),
    kind: g('kind'),
    heightCm: g('heightCm'),
    sizeWorn: g('sizeWorn'),
    shared: g('shared'),
    add: g('add'),
    adding: g('adding'),
    added: g('added'),
    archive: g('archive'),
    restore: g('restore'),
    confirmArchive: g('confirmArchive'),
    yes: g('yes'),
    cancel: g('cancel'),
    archived: g('archived'),
    own: g('own'),
    empty: g('empty'),
    kinds,
    angles,
    asset: {
      h: g('asset.h'),
      assetId: g('asset.assetId'),
      angle: g('asset.angle'),
      add: g('asset.add'),
      added: g('asset.added'),
      remove: g('asset.remove'),
      empty: g('asset.empty'),
    },
    consent: {
      h: g('consent.h'),
      scope: g('consent.scope'),
      grantedAt: g('consent.grantedAt'),
      expiresAt: g('consent.expiresAt'),
      documentAssetId: g('consent.documentAssetId'),
      add: g('consent.add'),
      added: g('consent.added'),
      empty: g('consent.empty'),
      valid: g('consent.valid'),
      expired: g('consent.expired'),
      neverExpires: g('consent.neverExpires'),
    },
    err: errs,
  };
  const { models } = await modelsOverview({ db: access.deps.db }, { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx });

  return (
    <div className="a2-z" data-testid="model-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />

      <section className="a2-sc a2-mt12" aria-labelledby="model-list-h" data-testid="model-list">
        <h2 className="a2-h3" id="model-list-h">
          {g('title')}
        </h2>
        {models.length ? (
          <ul className="adp-rules">
            {models.map((m) => {
              const validConsent = m.consentValid;
              return (
                <li key={m.id} className="adp-rule" data-testid="model-row" data-key={m.id} data-archived={Boolean(m.archivedAt)}>
                  <p className="a2-sm adp-sub">
                    {m.name} <span className="a2-pill info">{kinds[m.kind]}</span>
                    {m.gender ? <span className="a2-pill">{m.gender}</span> : null}
                    {m.ageGroup ? <span className="a2-pill">{m.ageGroup}</span> : null}
                    {m.heightCm ? <span className="a2-pill">{m.heightCm}cm</span> : null}
                    {m.sizeWorn ? <span className="a2-pill">{m.sizeWorn}</span> : null}
                    {m.archivedAt ? <span className="a2-pill line">{texts.archived}</span> : null}
                    {m.sharedWithAllStores ? <span className="a2-pill">{texts.shared}</span> : <span className="a2-pill">{texts.own}</span>}
                    <span className={`a2-pill${validConsent ? ' ok' : ' warn'}`}>{validConsent ? texts.consent.valid : texts.consent.empty}</span>
                  </p>

                  <p className="a2-sm a2-mute">{texts.asset.h}</p>
                  {m.assets.length ? (
                    <ul className="a2-sm">
                      {m.assets.map((a) => (
                        <li key={a.id} data-testid="model-asset-row">
                          {angles[a.angle]} — <code>{a.assetId}</code>
                          {canWrite ? <ModelAssetRemove url={API} assetRowId={a.id} texts={texts} /> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="a2-sm a2-mute">{texts.asset.empty}</p>
                  )}
                  {canWrite ? <ModelAssetAdd url={API} modelId={m.id} texts={texts} /> : null}

                  <p className="a2-sm a2-mute">{texts.consent.h}</p>
                  {m.consents.length ? (
                    <ul className="a2-sm">
                      {m.consents.map((c) => (
                        <li key={c.id} data-testid="model-consent-row">
                          {c.scope} — {new Date(c.grantedAt).toLocaleDateString()} →{' '}
                          {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : texts.consent.neverExpires}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="a2-sm a2-mute">{texts.consent.empty}</p>
                  )}
                  {canWrite ? <ModelConsentAdd url={API} modelId={m.id} texts={texts} /> : null}

                  {canWrite ? (
                    <div className="adp-read">
                      <ModelArchive url={API} model={m} texts={texts} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{texts.empty}</p>
        )}
      </section>

      {canWrite ? (
        <section className="a2-sc a2-mt12" aria-labelledby="model-new-h" data-testid="model-new-section">
          <h2 className="a2-h3" id="model-new-h">
            {g('add')}
          </h2>
          <ModelNew url={API} texts={texts} />
        </section>
      ) : null}
    </div>
  );
}
