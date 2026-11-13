// S28 · PR 682 — Products › FAQs: questions and answers for product pages — on one product, on every product of a
// category (added by itself) or shop-wide; also made from an answered customer question ("Make this an FAQ" on the
// Questions page). Reading needs `catalogue.read`, changing `catalogue.write`. Shown to customers only while
// `catalogue.faq` (More options) is on.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FaqManager, type FaqItem } from '@/components/admin/products/FaqManager';
import { nameIn } from '@/components/admin/products/model';
import { FieldsCard } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { catalogueAccess, one } from '@/lib/admin-products';
import { locateKey } from '@/lib/admin-shell/sections';
import { faqFields, fieldsTexts } from '@/lib/products-v5-fields';
import { productV5Cards } from '@/lib/products-v5-settings-api';
import { t } from '@/lib/i18n';
import '../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/products/faqs';
// Until the menu has its own entry for this page (docs/demo/admin-proto-v5/gap/NAV-PATCH-w4a.md) it sits under Questions.
const KEY = 'productQuestions';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: `${t(view.dict, 'products.faq.metaTitle')}`, robots: { index: false, follow: false } };
}

export default async function FaqsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [view, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('catalogue.read', deps, MOTHER_STORE_ID)]);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="products" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="product-faqs" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="catalogue.read" />
      </div>
    );
  const c = catalogueAccess(access);
  const archived = one(sp.archived) === '1';
  const [faqs, archivedFaqs, products, categories, cards] = await Promise.all([
    cat.listFaqs(c.deps, c.who, { archived }),
    cat.listFaqs(c.deps, c.who, { archived: !archived }),
    c.deps.db.product.findMany({ where: { storeId: c.storeId, archivedAt: null }, select: { id: true, nameEn: true, nameBn: true }, orderBy: { nameEn: 'asc' }, take: 500 }),
    c.deps.db.category.findMany({ where: { storeId: c.storeId, archivedAt: null }, select: { id: true, nameEn: true, nameBn: true }, orderBy: { nameEn: 'asc' } }),
    productV5Cards(access.deps, { actor: access.guard.actor, ctx: access.guard.ctx }),
  ]);
  const pname = new Map(products.map((p) => [p.id, nameIn(view.lang, p)]));
  const cname = new Map(categories.map((p) => [p.id, nameIn(view.lang, p)]));
  const items: FaqItem[] = faqs.map((f) => ({
    id: f.id,
    scope: f.scope,
    where: (f.scope === 'PRODUCT' ? pname.get(f.productId ?? '') : f.scope === 'CATEGORY' ? cname.get(f.categoryId ?? '') : '') ?? '',
    questionEn: f.questionEn,
    questionBn: f.questionBn,
    answerEn: f.answerEn,
    answerBn: f.answerBn,
    isActive: f.isActive,
    archived: f.archived,
    fromQuestion: f.sourceQuestionId !== null,
  }));
  const card = cards['catalogue.faq'];
  const canWrite = c.can('catalogue.write');
  const on = (card.value as { on?: boolean }).on === true;

  return (
    <div className="a2-z" data-testid="product-faqs" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(d, 'products.faq.title')} sub={t(d, 'products.faq.sub')} />
      <SectionTabs view={view} current={KEY} />
      {!on ? (
        <p className="a2-sm a2-mt12" data-testid="faq-off">
          {t(d, 'products.faq.off')}
        </p>
      ) : null}
      <FaqManager
        dict={d}
        items={items}
        products={products.map((p) => ({ id: p.id, name: pname.get(p.id) ?? '' }))}
        categories={categories.map((p) => ({ id: p.id, name: cname.get(p.id) ?? '' }))}
        canWrite={canWrite}
        showArchived={archived}
        archivedCount={archivedFaqs.length}
        archivedHref={`${HERE}?archived=1`}
        liveHref={HERE}
      />
      <details className="a2-mt12 a2-more-opts" data-testid="faq-more-opts">
        <summary className="a2-sm a2-b">{t(d, 'products.faq.checks.more')}</summary>
        <div className="a2-mt12">
          <FieldsCard
            url="/api/admin/products-v5-settings"
            screen={{ key: card.key, value: card.value, version: card.version }}
            fields={faqFields(d)}
            texts={fieldsTexts(d, 'products.faq.checks', 'products.faq.checks.h', 'products.faq.checks.d')}
            canEdit={canWrite}
            testId="faq-settings"
          />
        </div>
      </details>
    </div>
  );
}
