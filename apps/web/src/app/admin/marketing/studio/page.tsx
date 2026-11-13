// S23 · PR 437–441 (Blueprint C5 · Social & content studio) — Marketing › Studio at /admin/marketing/studio: the
// social accounts (PR 437: add, rename, switch, approval, daily limit, archive/restore; PR 441 adds TikTok's own
// `directPostApproved` draft/direct switch), the brand asset library and the templates (PR 438: add, update,
// archive/restore), render jobs (PR 439: queue a template + products, generate a preview — see render.ts for the
// honest scope) and now posts (PR 440/441: queue a finished render job onto a Facebook, Instagram or TikTok
// account; a post only reaches the real account once its account runs free and someone presses "Post now" — see
// publish.ts for the honest scope, including why YouTube still refuses). The calendar/approval queue and the
// comment/DM ingestion (PR 442–443) join this page as they are built. Seeing needs `studio.read`; managing
// accounts/templates/assets needs `studio.write`; queueing a render job or a post, and running a render job, need
// `studio.generate`; queuing a post on an account that runs free, and running it ("Post now"), also need
// `studio.publish` (the API checks every permission again, inside `@extas/studio`). Hidden from the menu by
// `stages.closedShown.S23` until the stage is finished (CN-036/CN-039), but this address works once you have it.
// lib/marketing/studio.ts. Guide: docs/admin-guide/pages/marketing/studio.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { BRAND_ASSET_KINDS, PUBLISHABLE_PLATFORMS, STUDIO_PLATFORMS, TEMPLATE_ASPECT_RATIOS, TEMPLATE_KINDS } from '@extas/studio';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { altFor, ResponsiveImage } from '@/components/media/ResponsiveImage';
import {
  StudioAccountForm,
  StudioAccountLimit,
  StudioAct,
  StudioAssetKind,
  StudioAssetUpload,
  StudioDecide,
  StudioPostForm,
  StudioRenderForm,
  StudioReschedule,
  StudioScheduleRuleControls,
  StudioScheduleRuleForm,
  StudioTemplateForm,
  type StudioFormTexts,
} from '@/components/admin/marketing/StudioForms';
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
  const canGenerate = access.guard.permissions?.has('studio.generate') ?? false;
  const canPublish = access.guard.permissions?.has('studio.publish') ?? false;
  const canApprove = access.guard.permissions?.has('studio.approve') ?? false;
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `studio.hub.${k}`, vars);
  const errKeys = ['INVALID_INPUT', 'NOT_FOUND', 'STALE', 'ALREADY_ADDED', 'TEMPLATE_ARCHIVED', 'NO_PRODUCTS', 'WRONG_STATE', 'ACCOUNT_OFF', 'NOT_SUPPORTED', 'DAILY_LIMIT', 'EMPTY', 'TOO_LARGE', 'NOT_AN_IMAGE', 'TYPE_NOT_ALLOWED', 'STILL_IN_USE', 'forbidden', 'unauthorized', 'network', 'other'];
  const err = Object.fromEntries(errKeys.map((k) => [k, g(`err.${k}`)]));
  const texts: StudioFormTexts = { err, fields: Object.fromEntries(['platform', 'externalId', 'name', 'kind', 'dailyLimit', 'directPostApproved', 'spec', 'assetId', 'templateId', 'productIds', 'caption', 'renderJobId', 'accountId', 'scheduledAt'].map((k) => [k, g(`f.${k}`)])) };
  const platforms = STUDIO_PLATFORMS.map((p) => ({ id: p, label: g(`platforms.${p}`) }));
  const kinds = TEMPLATE_KINDS.map((k) => ({ id: k, label: g(`templateKinds.${k}`) }));
  const assetKinds = BRAND_ASSET_KINDS.map((k) => ({ id: k, label: g(`assetKinds.${k}`) }));
  const liveAccounts = o.accounts.filter((a) => !a.archived);
  const liveTemplates = o.templates.filter((tp) => !tp.archived).map((tp) => ({ id: tp.id, label: `${tp.name} (${g(`templateKinds.${tp.kind}`)})` }));
  const postableAccounts = liveAccounts.filter((a) => a.enabled && (PUBLISHABLE_PLATFORMS as readonly string[]).includes(a.platform)).map((a) => ({ id: a.id, label: `${a.name} (${g(`platforms.${a.platform}`)})` }));
  const postableRenders = o.renders.filter((r) => r.status === 'SUCCEEDED').map((r) => ({ id: r.id, label: r.caption ? r.caption.slice(0, 60) : (r.kind ? g(`templateKinds.${r.kind}`) : r.id) }));
  // PR 442: a rule may pin itself to any live account (not only a publishable one yet — the dispatcher that would
  // need that does not exist; see schedule.ts's own honest-scope header).
  const ruleAccounts = liveAccounts.map((a) => ({ id: a.id, label: `${a.name} (${g(`platforms.${a.platform}`)})` }));
  const weekdayLabels = [0, 1, 2, 3, 4, 5, 6].map((n) => g(`rules.weekday${n}`));
  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleString(view.lang === 'bn' ? 'bn-BD' : 'en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

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
                {!a.archived && a.platform === 'tiktok' ? (
                  <p className="a2-sm a2-mute">{g(a.directPostApproved ? 'accounts.directApproved' : 'accounts.draftOnly')}</p>
                ) : null}
                {canWrite && !a.archived ? (
                  <span className="a2-gap8 yt-mt8">
                    <StudioAct texts={texts} body={{ action: 'account.switch', id: a.id, enabled: !a.enabled, version: a.version }} label={g(a.enabled ? 'accounts.turnOff' : 'accounts.turnOn')} testId="st-account-switch" done={g('accounts.saved')} />
                    <StudioAct texts={texts} body={{ action: 'account.requireApproval', id: a.id, requireApproval: !a.requireApproval, version: a.version }} label={g(a.requireApproval ? 'accounts.letRunFree' : 'accounts.askApproval')} testId="st-account-approval" done={g('accounts.saved')} />
                    <StudioAccountLimit texts={texts} id={a.id} version={a.version} dailyLimit={a.dailyLimit} w={{ label: g('accounts.limitPh'), save: g('accounts.limitSave'), saved: g('accounts.saved') }} />
                    {a.platform === 'tiktok' ? (
                      <StudioAct texts={texts} body={{ action: 'account.directPostApproved', id: a.id, directPostApproved: !a.directPostApproved, version: a.version }} label={g(a.directPostApproved ? 'accounts.switchToDraft' : 'accounts.switchToDirect')} testId="st-account-directpost" done={g('accounts.saved')} />
                    ) : null}
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

      <section className="a2-sc a2-mt12" aria-labelledby="st-rnd-h" data-testid="st-renders">
        <h2 className="a2-h3" id="st-rnd-h">
          {g('renders.h')}
        </h2>
        <p className="a2-sm a2-mute">{g('renders.d')}</p>
        {o.renders.length ? (
          <ul className="adp-rules">
            {o.renders.map((r) => {
              const img = r.outputAssetId ? o.images[r.outputAssetId] : undefined;
              return (
                <li key={r.id} className="adp-rule" data-testid="st-render">
                  {img ? (
                    <span style={{ display: 'inline-block', width: 72 }}>
                      <ResponsiveImage image={img} slot="thumb" sizes="72px" alt={altFor(img, view.lang, r.caption ?? '')} />
                    </span>
                  ) : null}
                  <p className="a2-sm adp-sub">
                    {r.kind ? g(`templateKinds.${r.kind}`) : r.id} <span className={`a2-pill ${r.status === 'SUCCEEDED' ? 'ok' : r.status === 'FAILED' ? 'warn' : 'line'}`}>{g(`renders.status.${r.status}`)}</span>
                  </p>
                  {r.caption ? <p className="a2-sm a2-mute">{r.caption}</p> : null}
                  {r.status === 'FAILED' ? <p className="a2-sm a2-mute">{g('renders.noPhoto')}</p> : null}
                  {canGenerate && r.status === 'QUEUED' ? (
                    <span className="a2-gap8 yt-mt8">
                      <StudioAct texts={texts} body={{ action: 'render.run', id: r.id }} label={g('renders.run')} testId="st-render-run" done={g('renders.ran')} />
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="a2-sm a2-mute yt-mt8">{g('renders.empty')}</p>
        )}
        {canGenerate ? (
          <details className="a2-mt12 a2-more-opts" data-testid="st-add-render" open={!o.renders.length}>
            <summary className="a2-sm a2-b">{g('renders.addH')}</summary>
            <StudioRenderForm
              texts={texts}
              templates={liveTemplates}
              w={{
                template: g('f.templateId'),
                noTemplates: g('renders.noTemplates'),
                products: g('f.productIds'),
                productsPh: g('renders.productsPh'),
                productsHelp: g('renders.productsHelp'),
                caption: g('f.caption'),
                captionPh: g('renders.captionPh'),
                queue: g('renders.queue'),
                queued: g('renders.queued'),
              }}
            />
          </details>
        ) : null}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="st-post-h" data-testid="st-posts">
        <h2 className="a2-h3" id="st-post-h">
          {g('posts.h')}
        </h2>
        <p className="a2-sm a2-mute">{g('posts.d')}</p>
        {o.posts.length ? (
          <ul className="adp-rules">
            {o.posts.map((p) => (
              <li key={p.id} className="adp-rule" data-testid="st-post">
                <p className="a2-sm adp-sub">
                  {g(`platforms.${p.platform}`)}{' '}
                  <span className={`a2-pill ${p.status === 'SUCCEEDED' ? 'ok' : p.status === 'FAILED' || p.status === 'REJECTED' ? 'warn' : 'line'}`}>{g(`posts.status.${p.status}`)}</span>
                </p>
                {p.caption ? <p className="a2-sm a2-mute">{p.caption}</p> : null}
                {p.status === 'FAILED' && p.error ? <p className="a2-sm a2-mute">{p.error}</p> : null}
                {p.status === 'SUCCEEDED' ? <p className="a2-sm a2-mute">{g('posts.posted')}</p> : null}
                {p.scheduledAt && (p.status === 'SCHEDULED' || p.status === 'PENDING_APPROVAL') ? <p className="a2-sm a2-mute">{g('posts.scheduledFor', { at: dateFmt(p.scheduledAt) })}</p> : null}
                {canPublish && p.status === 'PUBLISHING' ? (
                  <span className="a2-gap8 yt-mt8">
                    <StudioAct texts={texts} body={{ action: 'post.run', id: p.id }} label={g('posts.run')} testId="st-post-run" done={g('posts.ran')} />
                  </span>
                ) : null}
                {p.status === 'PENDING_APPROVAL' ? <p className="a2-sm a2-mute">{g('posts.waitingApproval')}</p> : null}
                {canApprove && p.status === 'PENDING_APPROVAL' ? (
                  <span className="yt-mt8">
                    <StudioDecide texts={texts} id={p.id} w={{ approve: g('posts.decide.approve'), reject: g('posts.decide.reject'), done: g('posts.decide.done') }} />
                  </span>
                ) : null}
                {canGenerate && (p.status === 'PENDING_APPROVAL' || p.status === 'SCHEDULED') ? (
                  <span className="yt-mt8">
                    <StudioReschedule texts={texts} id={p.id} scheduledAt={p.scheduledAt} w={{ label: g('posts.reschedule.label'), save: g('posts.reschedule.save'), clear: g('posts.reschedule.clear'), saved: g('posts.reschedule.saved') }} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute yt-mt8">{g('posts.empty')}</p>
        )}
        {canPublish ? (
          <p className="yt-mt8">
            <StudioAct texts={texts} body={{ action: 'schedule.runDue' }} label={g('runDue.button')} testId="st-run-due" done={g('runDue.done')} />
          </p>
        ) : null}
        {canGenerate ? (
          <details className="a2-mt12 a2-more-opts" data-testid="st-add-post" open={!o.posts.length}>
            <summary className="a2-sm a2-b">{g('posts.addH')}</summary>
            <StudioPostForm
              texts={texts}
              renders={postableRenders}
              accounts={postableAccounts}
              w={{
                renderJob: g('f.renderJobId'),
                noRenderJobs: g('posts.noRenderJobs'),
                account: g('f.accountId'),
                noAccounts: g('posts.noAccounts'),
                caption: g('f.caption'),
                captionPh: g('posts.captionPh'),
                captionHelp: g('posts.captionHelp'),
                scheduledAt: g('posts.scheduledAt'),
                scheduledAtHelp: g('posts.scheduledAtHelp'),
                queue: g('posts.queue'),
                queued: g('posts.queued'),
              }}
            />
          </details>
        ) : null}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="st-cal-h" data-testid="st-calendar">
        <h2 className="a2-h3" id="st-cal-h">
          {g('calendar.h')}
        </h2>
        <p className="a2-sm a2-mute">{g('calendar.d')}</p>
        {o.calendar.length ? (
          <ul className="adp-rules">
            {o.calendar.map((day) => (
              <li key={day.date} className="adp-rule" data-testid="st-calendar-day">
                <p className="a2-sm adp-sub">{day.date}</p>
                {day.posts.length ? (
                  <ul>
                    {day.posts.map((p) => (
                      <li key={p.id} className="a2-sm a2-mute">
                        {g(`platforms.${p.platform}`)} · {g(`posts.status.${p.status}`)}
                        {p.caption ? ` — ${p.caption.slice(0, 60)}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="a2-sm a2-mute">{g('calendar.dayEmpty')}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute yt-mt8">{g('calendar.empty')}</p>
        )}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="st-rules-h" data-testid="st-rules">
        <h2 className="a2-h3" id="st-rules-h">
          {g('rules.h')}
        </h2>
        <p className="a2-sm a2-mute">{g('rules.d')}</p>
        {o.scheduleRules.length ? (
          <ul className="adp-rules">
            {o.scheduleRules.map((r) => (
              <li key={r.id} className="adp-rule" data-testid="st-rule">
                <p className="a2-sm adp-sub">
                  {r.archived ? <span className="a2-pill line">{g('rules.archived')}</span> : <span className={`a2-pill ${r.enabled ? 'ok' : 'line'}`}>{g(r.enabled ? 'rules.on' : 'rules.off')}</span>}
                </p>
                <p className="a2-sm a2-mute">
                  {g('rules.postsPerDay')}: {r.cadence.postsPerDay} · {g('rules.reelsPerDay')}: {r.cadence.reelsPerDay}
                </p>
                {r.cadence.activeWeekdays.length ? <p className="a2-sm a2-mute">{r.cadence.activeWeekdays.map((wd) => weekdayLabels[wd]).join(', ')}</p> : null}
                <p className="a2-sm a2-mute">{r.nextActiveDay ? g('rules.nextActiveDay', { date: r.nextActiveDay }) : g('rules.noNextActiveDay')}</p>
                {canWrite ? <StudioScheduleRuleControls texts={texts} id={r.id} version={r.version} enabled={r.enabled} archived={r.archived} w={{ turnOn: g('rules.turnOn'), turnOff: g('rules.turnOff'), archive: g('rules.archive'), restore: g('rules.restore'), saved: g('rules.saved') }} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute yt-mt8">{g('rules.empty')}</p>
        )}
        {canWrite ? (
          <details className="a2-mt12 a2-more-opts" data-testid="st-add-rule" open={!o.scheduleRules.length}>
            <summary className="a2-sm a2-b">{g('rules.addH')}</summary>
            <StudioScheduleRuleForm
              texts={texts}
              accounts={ruleAccounts}
              w={{
                account: g('rules.account'),
                anyAccount: g('rules.anyAccount'),
                postsPerDay: g('rules.postsPerDay'),
                reelsPerDay: g('rules.reelsPerDay'),
                weekdays: g('rules.weekdays'),
                weekdayLabels,
                categoryIds: g('rules.categoryIds'),
                categoryIdsPh: g('rules.categoryIdsPh'),
                categoryIdsHelp: g('rules.categoryIdsHelp'),
                add: g('rules.add'),
                added: g('rules.added'),
              }}
            />
          </details>
        ) : null}
      </section>
    </div>
  );
}
