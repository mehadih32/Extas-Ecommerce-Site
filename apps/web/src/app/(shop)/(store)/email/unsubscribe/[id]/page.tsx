// S14 · PR 290 — /email/unsubscribe/:id: where an offer e-mail's unsubscribe line leads. One sentence and one button
// (a form POST to /api/email/unsubscribe/:id, so a link checker that opens the e-mail's links unsubscribes nobody); after
// it, the page says he gets no more offer e-mails (order e-mails still come). An unknown or broken address says the same
// short "not found" line. The words are the shop's (messages/shop.*.json `emailUnsub`); never indexed.
import type { Metadata } from 'next';
import { emailUnsubscribeState } from '@extas/messages';
import { adminDeps } from '@/lib/admin-auth';
import { shopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  return { title: c.t('meta.page', { page: c.t('emailUnsub.title'), store: c.storeName }), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> };

export default async function EmailUnsubscribePage({ params, searchParams }: Props) {
  const [c, { id }, q] = await Promise.all([shopContext(), params, searchParams]);
  const t = c.t;
  const deps = adminDeps();
  const state = deps ? await emailUnsubscribeState(deps.db, id).catch(() => ({ known: false, done: false })) : { known: false, done: false };
  const done = state.done || q.done === '1';
  return (
    <div className="container empty" data-testid="email-unsubscribe">
      <h1 className="h1">{t('emailUnsub.title')}</h1>
      {!state.known ? (
        <p className="muted mt12">{t('emailUnsub.unknown')}</p>
      ) : done ? (
        <p className="muted mt12" role="status">
          {t('emailUnsub.done')}
        </p>
      ) : (
        <form method="post" action={`/api/email/unsubscribe/${encodeURIComponent(id)}`}>
          <p className="muted mt12">{t('emailUnsub.text')}</p>
          <button type="submit" className="btn btn-primary mt16" data-testid="email-unsubscribe-yes">
            {t('emailUnsub.button')}
          </button>
        </form>
      )}
      <a className="btn btn-ghost mt16" href={hrefIn(c.lang, ROUTES.home)}>
        {t('notFound.home')}
      </a>
    </div>
  );
}
