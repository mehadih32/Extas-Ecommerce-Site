// S18 · PR 383 — SET-01 Settings › Store details at /admin/settings/store (docs/BACKEND-ARCHITECTURE.md §5.13;
// Blueprint F2 q27): the shop's legal numbers (registered name, trade licence, DBID, VAT BIN), owner data typed in here;
// how many are filled in and which are still missing before go-live. The shop prints each only when it is set; a
// filler value is refused on save and dropped where the shop reads it. Seeing needs `settings.read`; saving
// `settings.write` (the API checks again). The rest of SET-01 (name, logo, contacts, social links) joins with its PR.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { LEGAL_FIELD_IDS, legalMaxLength, storeView } from '@/lib/admin-store/service';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-store.bn.json';
import en from '../../../../../messages/admin-store.en.json';
import '../settings.css';
import '../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/settings/store';
const API = '/api/admin/store';
const KEY = 'store';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'stp.metaTitle'), robots: { index: false, follow: false } };
}

export default async function StorePage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('settings.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="settings.read" />
      </div>
    );
  const v = await storeView({ db: access.deps.db, resolver: access.deps.resolver }, { actor: access.guard.actor, ctx: access.guard.ctx });
  const canEdit = access.guard.permissions?.has('settings.write') ?? false;
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `stp.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const texts: FieldsCardTexts = {
    h: s('legal.h'),
    d: s('legal.d'),
    save: s('save'),
    saving: s('saving'),
    saved: s('saved'),
    discard: s('discard'),
    unsaved: s('unsaved'),
    readOnly: s('readOnly'),
    pairHelp: s('pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'PLACEHOLDER', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, s(`err.${c}`)])),
  };
  const helpOf: Partial<Record<(typeof LEGAL_FIELD_IDS)[number], string>> = { registeredName: s('legal.registeredNameHelp'), dbid: s('legal.dbidHelp'), bin: s('legal.binHelp') };
  const fields: FieldsCardField[] = LEGAL_FIELD_IDS.map((f) => ({ kind: 'text', path: f, label: s(`legal.${f}`), help: helpOf[f], max: legalMaxLength(f) }));
  const card = v.cards.legal;
  const filled = LEGAL_FIELD_IDS.length - v.missing.length;

  return (
    <div className="a2-z" data-testid="store-page">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis">
        <div className="a2-card a2-kpi" data-testid="store-kpi-legal" data-missing={v.missing.length}>
          <div className="a2-kl">{s('kpi.filled')}</div>
          <div className="a2-kv">{s('kpi.of', { n: num(filled), total: num(LEGAL_FIELD_IDS.length) })}</div>
          <div className="a2-kf">
            <span className="a2-kn">{v.missing.length ? s('kpi.notReady') : s('kpi.ready')}</span>
          </div>
        </div>
      </div>

      {v.missing.length ? (
        <div className="a2-note a2-mt12" role="status" data-testid="store-missing">
          <ShellIcon name="alert" size={15} />
          <span>{s('missing', { list: v.missing.map((f) => s(`names.${f}`)).join(', ') })}</span>
        </div>
      ) : null}

      <FieldsCard url={API} screen={{ key: card.key, value: card.value, version: card.version }} fields={fields} texts={texts} canEdit={canEdit} testId="store-legal" />
    </div>
  );
}
