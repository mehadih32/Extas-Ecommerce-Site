// S18 · PR 382 — SET-08d Settings › Privacy & data at /admin/settings/privacy (docs/BACKEND-ARCHITECTURE.md §5.13, CUS-07
// §5.5; decision D9): how long orders keep the internet address, device and shared location (`risk.capture`, PR 159)
// and how often the clean-up runs, its last run and how many orders still hold those facts; the switch for customers'
// erasure requests (off) and the requests with Cancel and, for the owner, "Erase now" behind a typed word; a link to
// the consent history (Messages › Consent). Seeing needs `security.read`; saving the card `security.write`; requests
// `customers.privacy` (the API checks again).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { registry } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PrivacyRequests } from '@/components/admin/settings/PrivacyRequests';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { dateTime } from '@/components/admin/stock/text';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { privacyView } from '@/lib/admin-privacy/service';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-privacy.bn.json';
import en from '../../../../../messages/admin-privacy.en.json';
import '../settings.css';
import '../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/settings/privacy';
const API = '/api/admin/privacy';
const KEY = 'privacy';
const CONSENT_PAGE = '/admin/messages/consent';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'prv.metaTitle'), robots: { index: false, follow: false } };
}

/** The min and max of one part of `risk.capture`, from its own schema (nothing typed twice). */
function bounds(sub: string): { min: number; max: number } {
  const s = (registry['risk.capture'].schema as unknown as { shape: Record<string, { minValue?: number | null; maxValue?: number | null }> }).shape[sub]!;
  return { min: s.minValue ?? 0, max: s.maxValue ?? Number.MAX_SAFE_INTEGER };
}

/** Flattens a nested messages object into dotted keys for the client card. */
function flat(o: Record<string, unknown>, at = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string') out[`${at}${k}`] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flat(v as Record<string, unknown>, `${at}${k}.`));
  }
  return out;
}

export default async function PrivacyPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('security.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="security.read" />
      </div>
    );
  const v = await privacyView({ db: access.deps.db, resolver: access.deps.resolver }, { actor: access.guard.actor, ctx: access.guard.ctx });
  const canEdit = access.guard.permissions?.has('security.write') ?? false;
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `prv.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const words = (view.lang === 'bn' ? bn : en).prv;
  const texts: FieldsCardTexts = {
    h: s('keep.h'),
    d: s('keep.d'),
    save: s('save'),
    saving: s('saving'),
    saved: s('saved'),
    discard: s('discard'),
    unsaved: s('unsaved'),
    readOnly: s('readOnly'),
    pairHelp: s('pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, s(`err.${c}`)])),
  };
  const keep: FieldsCardField[] = [
    { kind: 'number', path: 'retentionDays', label: s('keep.retentionDays'), help: s('keep.retentionHelp'), ...bounds('retentionDays') },
    { kind: 'number', path: 'purgeEveryMinutes', label: s('keep.purgeEveryMinutes'), ...bounds('purgeEveryMinutes') },
    { kind: 'switch', path: 'erasureRequests', label: s('keep.erasureRequests'), help: s('keep.erasureHelp') },
  ];
  const card = v.cards.keep;
  const on = card.value.erasureRequests === true;
  const last = v.purge.lastRun;

  return (
    <div className="a2-z" data-testid="privacy-page">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis">
        <div className="a2-card a2-kpi" data-testid="privacy-kpi-days">
          <div className="a2-kl">{s('kpi.days')}</div>
          <div className="a2-kv">{s('kpi.daysN', { n: num(card.value.retentionDays as number) })}</div>
        </div>
        <div className="a2-card a2-kpi" data-testid="privacy-kpi-last" data-status={last?.status ?? 'none'}>
          <div className="a2-kl">{s('kpi.lastRun')}</div>
          <div className="a2-kv a2-sm a2-kvw">{last ? dateTime(last.at, view.locale, view.timeZone) : s('kpi.never')}</div>
          {last ? (
            <div className="a2-kf">
              <span className="a2-kn">{s(`status.${last.status}`)}</span>
            </div>
          ) : null}
        </div>
        <div className="a2-card a2-kpi" data-testid="privacy-kpi-holding">
          <div className="a2-kl">{s('kpi.holding')}</div>
          <div className="a2-kv">{num(v.purge.holding)}</div>
          <div className="a2-kf">
            <span className="a2-kn">
              {s('kpi.overdue')}: {v.purge.overdue ? num(v.purge.overdue) : s('kpi.overdueNone')}
            </span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="privacy-kpi-erasure">
          <div className="a2-kl">{s('kpi.erasure')}</div>
          <div className="a2-kv a2-sm a2-kvw">{on ? s('kpi.on') : s('kpi.off')}</div>
        </div>
      </div>

      {v.purge.overdue ? (
        <div className="a2-note a2-mt12" role="status" data-testid="privacy-overdue">
          <ShellIcon name="alert" size={15} />
          <span>{s('overdueNote', { n: num(v.purge.overdue) })}</span>
        </div>
      ) : null}

      <FieldsCard url={API} screen={{ key: card.key, value: card.value, version: card.version }} fields={keep} texts={texts} canEdit={canEdit} testId="privacy-keep" />

      <section className="a2-card a2-mt12" data-testid="privacy-consent">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3">{s('consent.h')}</h2>
            <div className="a2-cs">{s('consent.d')}</div>
          </div>
        </div>
        <Link className="a2-btn a2-mt6" href={CONSENT_PAGE}>
          {s('consent.link')}
        </Link>
      </section>

      {v.requests ? (
        <PrivacyRequests
          w={flat(words as unknown as Record<string, unknown>)}
          effects={[...words.req.confirmEffects]}
          rows={v.requests.map((r) => ({ id: r.id, name: r.name, phoneEnd: r.phoneEnd, reason: r.reason, status: r.status, at: r.createdAt.toISOString() }))}
          on={on}
          canRequest={v.canRequest}
          canErase={v.canErase}
          locale={view.locale}
          timeZone={view.timeZone}
        />
      ) : null}
    </div>
  );
}
