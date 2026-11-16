// S28 · PR 686 (admin prototype v5) — Products › Shop ranking at /admin/products/ranking: the order products show in on the
// shop's own pages, from the owner's weights; ▲▼ since the last saved order; pin to the top or push to the end; "Save this
// order" puts it on the shop. More options (days that count as new, healthy stock, the order by itself) are a store setting
// (`shop.ranking`). Seeing it needs `catalogue.read`; changing it `catalogue.write`. Words: messages/admin-ranking.*.json.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { registry } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatMoney, nameIn } from '@/components/admin/products/model';
import { RankingHeadSave, RankingScreen } from '@/components/admin/products/RankingScreen';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { catalogueAccess, photosOf, storeMoney } from '@/lib/admin-products';
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
  // PR 962 (prototype v5): the facts the two previews under the sliders need: the price shown, is it new (the "days a product counts as new" setting), its category
  const [money, live, cats] = await Promise.all([
    storeMoney(c, view.locale),
    c.deps.db.product.findMany({
      where: { storeId: c.storeId, status: 'PUBLISHED', archivedAt: null },
      select: { id: true, categoryId: true, createdAt: true, publishedAt: true, variants: { where: { archivedAt: null, active: true }, select: { priceMinor: true } } },
    }),
    c.deps.db.category.findMany({ where: { storeId: c.storeId, archivedAt: null }, select: { id: true, nameEn: true, nameBn: true } }),
  ]);
  const DAY_MS = 86_400_000;
  const nowMs = (c.deps.now ?? (() => new Date()))().getTime();
  // PR 970: the previews' pictures — each product's primary photo (else its front photo, else any), as the product list shows them
  const liveIds = live.slice(0, 400).map((p) => p.id);
  const media = liveIds.length
    ? await c.deps.db.productMedia.findMany({
        where: { storeId: c.storeId, productId: { in: liveIds }, archivedAt: null, asset: { kind: 'IMAGE', archivedAt: null } },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { productId: true, assetId: true, role: true, isPrimary: true },
        take: 4000,
      })
    : [];
  const thumb = new Map<string, string>();
  for (const pass of [(m: (typeof media)[number]) => m.isPrimary, (m: (typeof media)[number]) => m.role === 'FRONT', () => true]) {
    for (const m of media) if (!thumb.has(m.productId) && pass(m)) thumb.set(m.productId, m.assetId);
  }
  const sources = await photosOf(c, [...thumb.values()]);
  const extras = live.map((p) => {
    const prices = p.variants.map((v) => v.priceMinor).filter((n): n is number => typeof n === 'number' && n > 0);
    return {
      productId: p.id,
      price: prices.length ? formatMoney(Math.min(...prices), money) : null,
      fresh: nowMs - (p.publishedAt ?? p.createdAt).getTime() <= ranking.settings.freshDays * DAY_MS,
      categoryId: p.categoryId,
      image: sources[thumb.get(p.id) ?? ''] ?? null,
    };
  });
  const catName = new Map(cats.map((x) => [x.id, nameIn(view.lang, x)]));
  const perCat = new Map<string, number>();
  for (const x of extras) if (x.categoryId) perCat.set(x.categoryId, (perCat.get(x.categoryId) ?? 0) + 1);
  const bySize = [...perCat.entries()].sort((a, b) => b[1] - a[1]);
  const pickCat = bySize.find(([id]) => /polo/i.test(catName.get(id) ?? '')) ?? bySize[0];
  const previewCat = pickCat ? { id: pickCat[0], name: catName.get(pickCat[0]) ?? '' } : null;
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
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={t(view.dict, 'productRanking.title')}
        sub={t(view.dict, 'productRanking.sub')}
        right={
          <>
            <Link className="a2-btn" href="/admin/website/seo" data-testid="ranking-google">
              {t(view.dict, 'productRanking.googleLink')}
            </Link>
            <RankingHeadSave dict={view.dict} canEdit={canEdit} />
          </>
        }
      />
      <SectionTabs view={view} current={KEY} />
      {/* PR 785 (prototype v5 parity): "How shop ranking works", three short steps */}
      <section className="a2-card a2-mb12" data-testid="ranking-how">
        <h2 className="a2-h3">{t(view.dict, 'productRanking.how.title')}</h2>
        <p className="a2-cs">{t(view.dict, 'productRanking.how.sub')}</p>
        <div className="rk-how">
          {(['1', '2', '3'] as const).map((n) => (
            <div key={n}>
              <b className="rk-n">{n}</b>
              <b>{t(view.dict, `productRanking.how.s${n}.h`)}</b>
              <p className="a2-xs a2-mute">{t(view.dict, `productRanking.how.s${n}.p`)}</p>
            </div>
          ))}
        </div>
      </section>
      <RankingScreen dict={view.dict} extras={extras} previewCat={previewCat} weights={ranking.settings.weights} defaults={registry['shop.ranking'].default.weights} rows={ranking.rows.map((r) => ({ productId: r.productId, name: r.name, sold30: r.sold30, score: r.score, rank: r.rank, pin: r.pin, moved: r.moved }))} savedAt={ranking.savedAt} canEdit={canEdit} />
      <div className="a2-mt12">
        <FieldsCard url="/api/admin/catalogue/ranking/options" screen={{ key: card.key, value: { ...card.value }, version: card.version }} fields={fields} texts={texts} canEdit={canEdit} testId="ranking-options" />
      </div>
    </div>
  );
}
