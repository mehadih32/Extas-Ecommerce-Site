// S14 · PR 295 — Products › Reviews (PRD-07, docs/BACKEND-ARCHITECTURE.md; demo 86-admin-reviews.js), the review
// manager behind the Day-3 review request (SIM-F-008): what buyers wrote, newest first, in the views To check ·
// Published · Hidden · Refused · With photo, each with the product, the stars, his words, the size and fit he gave,
// his photo, where it came from and the verified mark. The top line: how many wait, how many are published, the
// published average, and the requests that went after delivery with how many were answered (`reviews.requests`).
// Reading needs `reviews.read`; Publish · Hide · Refuse · Back to the queue · the verified mark need `reviews.moderate`
// (ReviewActions; the API checks again). Publishing a photo review pays the owner's photo reward only while he has
// switched it on with his own amount (PR 65). Nothing is deleted. Adding the shop's own review and importing a file stay
// on the reviews API until their forms are built.
// Follow-up 233: each card shows the shop's public reply and (with `reviews.moderate`) a box to write, change or take it
// off; More options gets "The shop's reply" (`pdp.reviewReply`, off: replies are kept but not shown on the shop).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatNumber, nameIn } from '@/components/admin/products/model';
import { ReviewActions } from '@/components/admin/reviews/ReviewActions';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ResponsiveImage } from '@/components/media/ResponsiveImage';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { catalogueAccess, one, photosOf, productHref } from '@/lib/admin-products';
import { withReviews } from '@/lib/admin-reviews/i18n';
import { reviewSettingCards } from '@/lib/review-settings-api';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../../settings-cards.css';
import './reviews.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/products/reviews';
const KEY = 'productReviews';
const VIEWS = ['PENDING', 'APPROVED', 'HIDDEN', 'REJECTED', 'photo'] as const;
type View = (typeof VIEWS)[number];
const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const view = withReviews(await adminView());
  return { title: `${t(view.dict, 'rev.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

const hrefOf = (v: View, cursor?: string) => {
  const q = new URLSearchParams();
  if (v !== 'PENDING') q.set('view', v);
  if (cursor) q.set('cursor', cursor);
  const s = q.toString();
  return s ? `${HERE}?${s}` : HERE;
};

export default async function ReviewsPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [plain, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('reviews.read', deps, MOTHER_STORE_ID)]);
  const view = withReviews(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="reviews.read" />
      </div>
    );
  const c = catalogueAccess(access);
  const tab: View = (VIEWS as readonly string[]).includes(one(sp.view) ?? '') ? (one(sp.view) as View) : 'PENDING';
  const rawCursor = one(sp.cursor);
  const cursor = rawCursor && UUID.test(rawCursor) ? rawCursor : undefined;
  const canModerate = c.can('reviews.moderate');
  const [list, desk, currency, cards] = await Promise.all([
    cat.listReviews(c.deps, c.who, { ...(tab === 'photo' ? { withPhoto: true } : { status: tab }), ...(cursor ? { cursor } : {}) }),
    cat.reviewDesk(c.deps, c.who),
    c.deps.settings.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>,
    reviewSettingCards(access.deps, { actor: access.guard.actor, ctx: access.guard.ctx }),
  ]);
  const cardTexts: FieldsCardTexts = {
    h: t(d, 'rev.set.h'),
    d: t(d, 'rev.set.d'),
    save: t(d, 'rev.set.save'),
    saving: t(d, 'rev.set.saving'),
    saved: t(d, 'rev.set.saved'),
    discard: t(d, 'rev.set.discard'),
    unsaved: t(d, 'rev.set.unsaved'),
    readOnly: t(d, 'rev.set.readOnly'),
    pairHelp: '',
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, t(d, `rev.set.err.${k}`)])),
  };
  const fields: FieldsCardField[] = [
    { kind: 'switch', path: 'skipReviewed', label: t(d, 'rev.set.skipReviewed'), help: t(d, 'rev.set.skipReviewedHelp') },
    { kind: 'number', path: 'resultDays', label: t(d, 'rev.set.resultDays'), help: t(d, 'rev.set.resultDaysHelp'), min: 1, max: 365 },
  ];
  const card = cards['reviews.requests'];
  const replyCard = cards['pdp.reviewReply'];
  const replyTexts: FieldsCardTexts = { ...cardTexts, h: t(d, 'rev.reply.set.h'), d: t(d, 'rev.reply.set.d') };
  const replyFields: FieldsCardField[] = [{ kind: 'switch', path: 'show', label: t(d, 'rev.reply.set.show'), help: t(d, 'rev.reply.set.showHelp') }];
  const productIds = [...new Set(list.reviews.map((r) => r.productId).filter((x): x is string => !!x))];
  const [products, photos] = await Promise.all([
    productIds.length ? c.deps.db.product.findMany({ where: { storeId: c.storeId, id: { in: productIds } }, select: { id: true, nameEn: true, nameBn: true } }) : Promise.resolve([]),
    photosOf(
      c,
      list.reviews.flatMap((r) => r.photos.map((p) => p.assetId)),
    ),
  ]);
  const productName = new Map(products.map((p) => [p.id, nameIn(view.lang, p)]));
  const n = (x: number) => formatNumber(x, view.locale);
  const pct = (a: number, b: number) => n(b ? Math.round((a / b) * 100) : 0);
  const day = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, numberingSystem: 'latn', dateStyle: 'medium' });
  const money = (minor: number) => new Intl.NumberFormat(view.locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2, numberingSystem: 'latn' }).format(minor / 100);
  const counts: Record<View, number | null> = { PENDING: list.counts.PENDING, APPROVED: list.counts.APPROVED, HIDDEN: list.counts.HIDDEN, REJECTED: list.counts.REJECTED, photo: null };
  const rq = desk.requests;
  const kpis = [
    { id: 'pending', value: n(list.counts.PENDING), note: t(d, 'rev.kpi.pendingNote') },
    { id: 'published', value: n(desk.published), note: t(d, 'rev.kpi.publishedNote') },
    { id: 'average', value: desk.average === null ? t(d, 'rev.kpi.averageNone') : desk.average.toFixed(1), note: t(d, 'rev.kpi.averageNote') },
    { id: 'asked', value: n(rq.asked), note: t(d, 'rev.kpi.askedNote', { answered: n(rq.answered), pct: pct(rq.answered, rq.asked), days: n(rq.days) }) },
  ];

  return (
    <div className="a2-z" data-testid="product-reviews" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(d, 'rev.title')} sub={t(d, 'rev.sub')} />
      <SectionTabs view={view} current={KEY} />
      {!canModerate ? <p className="a2-xs a2-mute a2-mt12">{t(d, 'rev.readOnly')}</p> : null}
      <div className="a2-kpis a2-mt12" data-testid="review-kpis">
        {kpis.map((k) => (
          <div key={k.id} className="a2-card a2-kpi" data-testid={`review-kpi-${k.id}`}>
            <div className="a2-kl">{t(d, `rev.kpi.${k.id}`)}</div>
            <div className="a2-kv">{k.value}</div>
            <div className="a2-kf">
              <span className="a2-kn">{k.note}</span>
            </div>
          </div>
        ))}
      </div>
      <section className="a2-card" data-testid="review-requests">
        <h2 className="a2-h3">{t(d, 'rev.req.title')}</h2>
        <p className="a2-sm">{rq.asked ? t(d, 'rev.req.line', { days: n(rq.days), asked: n(rq.asked), answered: n(rq.answered), pct: pct(rq.answered, rq.asked), photo: n(rq.withPhoto) }) : t(d, 'rev.req.none', { days: n(rq.days) })}</p>
        {rq.byChannel.length ? (
          <ul className="rev-ch">
            {rq.byChannel.map((ch) => (
              <li key={ch.channel} className="a2-xs a2-mute">
                {t(d, 'rev.req.channel', { channel: t(d, `rev.ch.${ch.channel}`), asked: n(ch.asked), answered: n(ch.answered) })}
              </li>
            ))}
          </ul>
        ) : null}
        <Link className="a2-btn rev-link" href="/admin/messages/journey">
          {t(d, 'rev.req.timing')}
        </Link>
      </section>
      <nav className="a2-views a2-mt12" aria-label={t(d, 'rev.views')} data-testid="review-views">
        {VIEWS.map((v) => (
          <Link key={v} className={`a2-view${v === tab ? ' on' : ''}`} href={hrefOf(v)} aria-current={v === tab ? 'page' : undefined} scroll={false} data-view={v}>
            {t(d, `rev.view.${v}`)}
            {counts[v] !== null ? <span className="a2-cnt">{n(counts[v])}</span> : null}
          </Link>
        ))}
      </nav>
      {list.reviews.length ? (
        <div className="a2-stack a2-mt12" data-testid="review-list">
          {list.reviews.map((r) => {
            const name = r.productId ? productName.get(r.productId) : undefined;
            return (
              <article key={r.id} className={`a2-card tight rev-card s-${r.status}`} data-testid="review-row" data-state={r.status}>
                <div className="a2-between rev-head">
                  <div className="rev-who">
                    <span className="rev-stars" role="img" aria-label={`${r.rating}/5`}>
                      {'★'.repeat(r.rating)}
                      <span className="rev-off">{'★'.repeat(5 - r.rating)}</span>
                    </span>
                    <b>{r.displayName ?? t(d, 'rev.anonymous')}</b>
                    <span className="a2-xs a2-mute">{day.format(new Date(r.createdAt))}</span>
                  </div>
                  <div className="a2-gap8">
                    <span className={`a2-pill ${r.status === 'APPROVED' ? 'ok' : 'line'}`}>{t(d, `rev.state.${r.status}`)}</span>
                    {r.isVerifiedPurchase ? <span className="a2-pill ok">{t(d, 'rev.verified')}</span> : null}
                    <span className="a2-pill line">{t(d, `rev.source.${r.source}`)}</span>
                  </div>
                </div>
                <p className="a2-sm">
                  {r.productId && name ? (
                    <Link className="a2-b rev-prod" href={productHref(r.productId)}>
                      {name}
                    </Link>
                  ) : (
                    <span className="a2-mute">{t(d, 'rev.noProduct')}</span>
                  )}
                  {r.sizeLabel ? <span className="a2-xs a2-mute"> · {t(d, 'rev.line', { size: r.sizeLabel, colour: r.colourName ?? '' })}</span> : null}
                </p>
                {r.title ? <p className="a2-b">{r.title}</p> : null}
                {r.body ? <p className="rev-body">{r.body}</p> : null}
                {r.fit || r.heightCm || r.weightKg ? (
                  <p className="a2-xs a2-mute">
                    {r.fit ? t(d, `rev.fit.${r.fit}`) : ''}
                    {r.fit && (r.heightCm || r.weightKg) ? ' · ' : ''}
                    {r.heightCm || r.weightKg ? t(d, 'rev.body', { height: r.heightCm ? n(r.heightCm) : '—', weight: r.weightKg ? n(r.weightKg) : '—' }) : ''}
                  </p>
                ) : null}
                {r.photos.length ? (
                  <div className="rev-photos">
                    {r.photos.map((p) => {
                      const img = photos[p.assetId];
                      return img ? <ResponsiveImage key={p.assetId} image={img} slot="thumb" sizes="96px" alt={t(d, 'rev.photoAlt')} className="rev-photo" /> : null;
                    })}
                  </div>
                ) : null}
                {r.reward ? <p className="a2-xs">{t(d, 'rev.rewarded', { amount: money(r.reward.amountMinor) })}</p> : null}
                {r.reply ? (
                  <div className="rev-reply-shown" data-testid="review-reply">
                    <span className="a2-xs a2-mute">{t(d, 'rev.reply.shown')}</span>
                    <p className="rev-body">{r.reply}</p>
                  </div>
                ) : null}
                {canModerate ? <ReviewActions dict={d} id={r.id} state={r.status} verified={r.isVerifiedPurchase} currency={currency} locale={view.locale} reply={r.reply} replyMax={cat.REPLY_MAX} /> : null}
              </article>
            );
          })}
          {list.nextCursor ? (
            <Link className="a2-btn rev-more" href={hrefOf(tab, list.nextCursor)} data-testid="review-more">
              {t(d, 'rev.more')}
            </Link>
          ) : null}
        </div>
      ) : (
        <section className="a2-card a2-mt12" data-testid="review-empty">
          <p className="a2-sm a2-mute">{t(d, `rev.empty.${tab}`)}</p>
        </section>
      )}
      <details className="a2-mt12 a2-more-opts" data-testid="review-more-opts">
        <summary className="a2-sm a2-b">{t(d, 'rev.set.more')}</summary>
        <div className="a2-mt12">
          <FieldsCard url="/api/admin/review-settings" screen={{ key: card.key, value: card.value, version: card.version }} fields={fields} texts={cardTexts} canEdit={canModerate} testId="review-requests-card" />
        </div>
        <div className="a2-mt12">
          <FieldsCard url="/api/admin/review-settings" screen={{ key: replyCard.key, value: replyCard.value, version: replyCard.version }} fields={replyFields} texts={replyTexts} canEdit={canModerate} testId="review-reply-card" />
        </div>
      </details>
    </div>
  );
}
