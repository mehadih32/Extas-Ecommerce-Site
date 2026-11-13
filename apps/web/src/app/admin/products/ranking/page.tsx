// S28 · PR 686 (admin prototype v5) — Products › Shop ranking at /admin/products/ranking: the order products show in on the
// shop's own pages, from the owner's weights; ▲▼ since the last saved order; pin to the top or push to the end; "Save this
// order" puts it on the shop. More options (days that count as new, healthy stock, the order by itself) are a store setting
// (`shop.ranking`). Seeing it needs `catalogue.read`; changing it `catalogue.write`. Words: messages/admin-ranking.*.json.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { registry } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { RankingScreen } from '@/components/admin/products/RankingScreen';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { catalogueAccess } from '@/lib/admin-products';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { rankingDeps, rankingOptionsCard } from '@/lib/shop-ranking-api';
import bn from '../../../../../messages/admin-ranking.bn.json';
import en from '../../../../../messages/admin-ranking.en.json';
import '../../settings/settings.css';
import '../../settings-cards.css';
import '../../wave4b.css';

export const dynamic = 'force-dynamic';

const KEY = 'productRanking';
const HERE = '/admin/products/ranking';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, productRanking: (view.lang === 'bn' ? bn : en).productRanking as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'productRanking.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function RankingPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('catalogue.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="ranking-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="catalogue.read" />
      </div>
    );
  const c = catalogueAccess(access);
  const canEdit = c.can('catalogue.write');
  const [ranking, card] = await Promise.all([cat.rankingView(rankingDeps(access.deps, c.storeId), c.who), rankingOptionsCard(access.deps, c.storeId)]);
  const o = (key: string) => t(view.dict, `productRanking.options.${key}`);
  const texts: FieldsCardTexts = {
    h: o('h'),
    d: o('d'),
    save: o('save'),
    saving: o('saving'),
    saved: o('saved'),
    discard: o('discard'),
    unsaved: o('unsaved'),
    readOnly: o('readOnly'),
    pairHelp: '',
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'FORBIDDEN', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, o(`err.${k}`)])),
  };
  const fields: FieldsCardField[] = [
    { kind: 'number', path: 'freshDays', label: o('freshDays'), help: o('freshDaysHelp'), min: 1, max: 730 },
    { kind: 'number', path: 'coverDays', label: o('coverDays'), help: o('coverDaysHelp'), min: 1, max: 365 },
    { kind: 'switch', path: 'autoApply', label: o('autoApply'), help: o('autoApplyHelp') },
  ];
  return (
    <div className="a2-z" data-testid="ranking-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(view.dict, 'productRanking.title')} sub={t(view.dict, 'productRanking.sub')} />
      <SectionTabs view={view} current={KEY} />
      <RankingScreen dict={view.dict} weights={ranking.settings.weights} defaults={registry['shop.ranking'].default.weights} rows={ranking.rows.map((r) => ({ productId: r.productId, name: r.name, sold30: r.sold30, score: r.score, rank: r.rank, pin: r.pin, moved: r.moved }))} savedAt={ranking.savedAt} canEdit={canEdit} />
      <div className="a2-mt12">
        <FieldsCard url="/api/admin/catalogue/ranking/options" screen={{ key: card.key, value: { ...card.value }, version: card.version }} fields={fields} texts={texts} canEdit={canEdit} testId="ranking-options" />
      </div>
    </div>
  );
}
