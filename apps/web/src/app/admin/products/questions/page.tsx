// S02 · PR 66 follow-up 184 — Products › Reviews › Questions: what customers asked about a product, checked before
// anyone sees it, in the views To answer · Published · Hidden · Archived. Each card shows the product, the question,
// when it came and the shop's answer box. A question reaches the product page only once it is answered and published
// (lib/shop/pdp-qa-load reads APPROVED, answered, not archived). Reading needs `reviews.read`; answering and the moves
// need `reviews.moderate` (QuestionActions; the API checks again). Nothing is deleted: Archive keeps the row.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatNumber, nameIn } from '@/components/admin/products/model';
import { QuestionActions } from '@/components/admin/reviews/QuestionActions';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { catalogueAccess, one, productHref } from '@/lib/admin-products';
import { withReviews } from '@/lib/admin-reviews/i18n';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../reviews/reviews.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/products/questions';
const KEY = 'productQuestions';
const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const view = withReviews(await adminView());
  return { title: `${t(view.dict, 'revq.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

const hrefOf = (v: cat.QuestionView, cursor?: string) => {
  const q = new URLSearchParams();
  if (v !== 'open') q.set('view', v);
  if (cursor) q.set('cursor', cursor);
  const s = q.toString();
  return s ? `${HERE}?${s}` : HERE;
};

export default async function QuestionsPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [plain, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('reviews.read', deps, MOTHER_STORE_ID)]);
  const view = withReviews(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="product-questions" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="reviews.read" />
      </div>
    );
  const c = catalogueAccess(access);
  const raw = one(sp.view) ?? '';
  const tab: cat.QuestionView = (cat.QUESTION_VIEWS as readonly string[]).includes(raw) ? (raw as cat.QuestionView) : 'open';
  const rawCursor = one(sp.cursor);
  const cursor = rawCursor && UUID.test(rawCursor) ? rawCursor : undefined;
  const canModerate = c.can('reviews.moderate');
  const list = await cat.listQuestions(c.deps, c.who, { view: tab, ...(cursor ? { cursor } : {}) });
  const productIds = [...new Set(list.questions.map((q) => q.productId))];
  const products = productIds.length ? await c.deps.db.product.findMany({ where: { storeId: c.storeId, id: { in: productIds } }, select: { id: true, nameEn: true, nameBn: true } }) : [];
  const productName = new Map(products.map((p) => [p.id, nameIn(view.lang, p)]));
  const n = (x: number) => formatNumber(x, view.locale);
  const day = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, numberingSystem: 'latn', dateStyle: 'medium' });
  const kpis = [
    { id: 'unanswered', value: n(list.counts.unanswered) },
    { id: 'open', value: n(list.counts.open) },
    { id: 'published', value: n(list.counts.published) },
  ];

  return (
    <div className="a2-z" data-testid="product-questions" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(d, 'revq.title')} sub={t(d, 'revq.sub')} />
      <SectionTabs view={view} current={KEY} />
      {!canModerate ? <p className="a2-xs a2-mute a2-mt12">{t(d, 'revq.readOnly')}</p> : null}
      <div className="a2-kpis a2-mt12" data-testid="question-kpis">
        {kpis.map((k) => (
          <div key={k.id} className="a2-card a2-kpi" data-testid={`question-kpi-${k.id}`}>
            <div className="a2-kl">{t(d, `revq.kpi.${k.id}`)}</div>
            <div className="a2-kv">{k.value}</div>
            <div className="a2-kf">
              <span className="a2-kn">{t(d, `revq.kpi.${k.id}Note`)}</span>
            </div>
          </div>
        ))}
      </div>
      <nav className="a2-views a2-mt12" aria-label={t(d, 'revq.views')} data-testid="question-views">
        {cat.QUESTION_VIEWS.map((v) => (
          <Link key={v} className={`a2-view${v === tab ? ' on' : ''}`} href={hrefOf(v)} aria-current={v === tab ? 'page' : undefined} scroll={false} data-view={v}>
            {t(d, `revq.view.${v}`)}
            <span className="a2-cnt">{n(list.counts[v])}</span>
          </Link>
        ))}
      </nav>
      {list.questions.length ? (
        <div className="a2-stack a2-mt12" data-testid="question-list">
          {list.questions.map((q) => {
            const name = productName.get(q.productId);
            return (
              <article key={q.id} className={`a2-card tight rev-card s-${q.archived ? 'HIDDEN' : q.status}`} data-testid="question-row" data-state={q.archived ? 'ARCHIVED' : q.status}>
                <div className="a2-between rev-head">
                  <div className="rev-who">
                    {name ? (
                      <Link className="a2-b rev-prod" href={productHref(q.productId)}>
                        {name}
                      </Link>
                    ) : (
                      <span className="a2-mute">{t(d, 'rev.noProduct')}</span>
                    )}
                    <span className="a2-xs a2-mute">{day.format(new Date(q.createdAt))}</span>
                  </div>
                  <div className="a2-gap8">
                    <span className={`a2-pill ${q.status === 'APPROVED' && !q.archived ? 'ok' : 'line'}`}>{t(d, q.archived ? 'revq.state.ARCHIVED' : `revq.state.${q.status}`)}</span>
                    {!q.answer ? <span className="a2-pill line">{t(d, 'revq.noAnswer')}</span> : null}
                    <span className="a2-pill line">{t(d, q.fromAccount ? 'revq.fromAccount' : 'revq.fromGuest')}</span>
                  </div>
                </div>
                <p className="rev-body a2-b">{q.question}</p>
                {q.answer && (!canModerate || q.archived) ? (
                  <p className="rev-body">
                    <span className="a2-xs a2-mute">{t(d, 'revq.answer')}: </span>
                    {q.answer}
                  </p>
                ) : null}
                {q.answeredAt ? <p className="a2-xs a2-mute">{t(d, 'revq.answeredAt', { date: day.format(new Date(q.answeredAt)) })}</p> : null}
                {canModerate ? <QuestionActions dict={d} id={q.id} state={q.status} archived={q.archived} answer={q.answer} max={cat.ANSWER_MAX} /> : null}
              </article>
            );
          })}
          {list.nextCursor ? (
            <Link className="a2-btn rev-more" href={hrefOf(tab, list.nextCursor)} data-testid="question-more">
              {t(d, 'rev.more')}
            </Link>
          ) : null}
        </div>
      ) : (
        <section className="a2-card a2-mt12" data-testid="question-empty">
          <p className="a2-sm a2-mute">{t(d, `revq.empty.${tab}`)}</p>
        </section>
      )}
    </div>
  );
}
