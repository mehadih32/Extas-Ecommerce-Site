// S28 · PR 694 (CN-048; prototype v5 Inbox › Comments › Live selling; gap I11, N3) — Live selling at
// /admin/support/comments/live. Start a live for a Page with the product codes said on air; while it runs, comments like
// "P1 L 2 pcs" are read (code, size, quantity) and kept; "Make draft" / "Make all" put the piece in that person's chat bag
// (the chat-order path) — nothing becomes an order here: staff confirm by a call and press "Create order" in the chat.
// Mock until the Page's keys: comments can be added by hand (practice). Off as shipped: "More options" holds the switch and
// the most pieces one comment may ask (`support.settings`). Seeing needs `support.read`; starting, ending, adding and
// skipping `support.reply`; making drafts `support.order`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sp from '@extas/support';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AddByHand, EndLive, MakeDraft, StartLive } from '@/components/admin/v5/LiveParts';
import { V5Number, V5Switch } from '@/components/admin/v5/Parts';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withW5a } from '@/lib/admin-v5-w5a';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { supportDeps } from '@/lib/support-api';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../../../reports/delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'supportCommentsLive';
const HERE = '/admin/support/comments/live';

export async function generateMetadata(): Promise<Metadata> {
  const view = withW5a(await adminView());
  return { title: `${t(view.dict, 'w5a.live.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function LivePage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('support.read', deps, MOTHER_STORE_ID)]);
  const view = withW5a(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="live-selling" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="support.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `w5a.live.${k}`, v);
  const who: sp.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const board = await sp.liveBoard(supportDeps(access.deps), who);
  const perms = access.guard.permissions;
  const can = { act: perms?.has('support.reply') ?? false, make: perms?.has('support.order') ?? false, settings: perms?.has('support.settings') ?? false };
  const lang = view.lang;
  const pick = (x: { nameEn: string; nameBn: string | null }) => (lang === 'bn' && x.nameBn ? x.nameBn : x.nameEn);
  const running = board.session?.status === 'LIVE';
  const products =
    board.enabled && can.act && !running
      ? (await access.deps.db.product.findMany({ where: { storeId: MOTHER_STORE_ID, status: 'PUBLISHED', archivedAt: null }, orderBy: { nameEn: 'asc' }, take: 300, select: { id: true, nameEn: true, nameBn: true } })).map((p) => ({ id: p.id, name: pick(p) }))
      : [];
  const sw = await access.deps.resolver.value('support.liveSelling', { storeId: MOTHER_STORE_ID });
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' });
  const n = (x: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(x);
  const tone = (s: sp.CaptureState) => (s === 'READY' ? 'info' : s === 'IN_BAG' ? 'ok' : s === 'SOLD_OUT' ? 'warn' : 'line');

  return (
    <div className="a2-z" data-testid="live-selling" data-lm-ready="" data-on={board.enabled ? 'yes' : 'no'}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} right={<Link className="a2-btn sm" href="/admin/support/comments">{c('back')}</Link>} />
      {!board.enabled ? <div className="a2-note a2-mt12">{c('off')}</div> : null}
      {board.enabled && !running && can.act ? (
        <section className="a2-card a2-mt12" aria-label={c('start')}>
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {c('start')}
          </h2>
          <StartLive dict={d} products={products} />
        </section>
      ) : null}
      {board.enabled && board.session ? (
        <>
          <section className="a2-card a2-mt12" data-testid="live-session" data-status={board.session.status}>
            <div className="a2-gap8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 className="a2-h3">{board.session.title}</h2>
              <span className={`a2-pill ${running ? 'bad' : 'line'}`}>{running ? c('running') : c('ended')}</span>
              <span className="a2-xs a2-mute">{c('startedAt', { at: when.format(board.session.startedAt) })}</span>
              {running && can.act ? <EndLive dict={d} /> : null}
            </div>
            <p className="a2-sm a2-mt6">
              {c('codesLine')}{' '}
              {board.session.codes.map((x) => (
                <span key={x.code} style={{ marginRight: 10 }}>
                  <b className="a2-mono">{x.code}</b> = {x.product ? pick(x.product) : '—'}
                </span>
              ))}
            </p>
          </section>
          <div className="a2-kpis a2-mt12">
            {(
              [
                ['kCaught', board.captures.length],
                ['kReady', board.ready],
                ['kDrafted', board.drafted],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="a2-card">
                <div className="a2-xs a2-mute">{c(k)}</div>
                <div className="a2-h2">{n(v)}</div>
              </div>
            ))}
          </div>
          <section className="a2-card a2-mt12" data-testid="live-list">
            {running && can.make ? (
              <div className="a2-gap8" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
                <MakeDraft dict={d} all count={board.ready} canMake />
              </div>
            ) : null}
            {board.captures.length ? (
              <ul className="cr-rows" style={{ marginTop: 0 }}>
                {board.captures.map((x) => (
                  <li key={x.id} data-testid="live-row" data-state={x.state}>
                    <div>
                      <div className="a2-gap8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <b>{x.name ?? '—'}</b>
                        <span className="a2-mono">{x.text}</span>
                        <span className={`a2-pill ${tone(x.state)}`}>{c(`s_${x.state}`)}</span>
                        {x.practice ? <span className="a2-pill line">{c('practice')}</span> : null}
                      </div>
                      <div className="a2-xs a2-mute a2-mt6">
                        {x.state === 'NOT_ORDER' && x.reason ? c(`r_${x.reason}`) : x.product && x.size ? c('piece', { product: pick(x.product), size: x.size, qty: x.qty ?? 1 }) : null}
                        {x.guessedCode ? ` (${c('guessed')})` : ''}
                        {x.colourToConfirm ? ` · ${c('colour')}` : ''}
                      </div>
                      {x.conversationId ? (
                        <div className="a2-mt6">
                          <Link className="cr-link" href={`/admin/support/c/${x.conversationId}`}>
                            {c('openChat')}
                          </Link>
                        </div>
                      ) : null}
                    </div>
                    {running && (x.state === 'READY' || x.state === 'NO_CHAT' || x.state === 'SOLD_OUT') && can.act ? <MakeDraft dict={d} captureId={x.id} canMake={can.make && x.state === 'READY'} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute">{c('none')}</p>
            )}
            <p className="a2-xs a2-mute a2-mt6">{c('note')}</p>
          </section>
          {running && can.act ? (
            <section className="a2-card a2-mt12" aria-label={c('hand')}>
              <h2 className="a2-h3" style={{ marginBottom: 10 }}>
                {c('hand')}
              </h2>
              <AddByHand dict={d} />
            </section>
          ) : null}
        </>
      ) : null}
      {board.enabled && !board.session ? <p className="a2-sm a2-mute a2-mt12">{c('noSession')}</p> : null}
      {can.settings ? (
        <details className="a2-card a2-mt12" data-testid="live-more">
          <summary className="a2-h4">{t(d, 'w5a.more')}</summary>
          <div className="a2-stack a2-mt12" style={{ gap: 12 }}>
            <V5Switch dict={d} url="/api/admin/support/live/settings" before={sw} label={sw.enabled ? c('switchOff') : c('switchOn')} tone={sw.enabled ? '' : 'pri'} testId="live-switch" />
            <V5Number dict={d} url="/api/admin/support/live/settings" before={sw} field="maxQty" label={c('maxQty')} min={1} max={50} save={t(d, 'w5a.replies.save')} testId="live-maxqty" />
          </div>
        </details>
      ) : null}
    </div>
  );
}
