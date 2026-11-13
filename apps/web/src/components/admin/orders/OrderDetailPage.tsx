// PR 141 — ORD-07 one order (demo V12.3 #/admin/orders/:id): the header (number, name and total, the four separate
// status chips, when and where it was placed, the next step and "More actions"), the bands that need someone now
// (cancel pending courier, the customer's cancel request, a hold, a booked parcel's lock), then the record cards on two
// thirds (items and totals, customer and address with the customer's history, the courier, the risk card (PR 160), the
// duplicate review with its alert summary (PR 521), payments and refund requests; PR 127 follow-up 215: "Add a line" on the
// items card and "Remove" on a line added after the order was placed) and the timeline on one third with the team's notes. A phone gets "Details · Timeline".
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import type { AdminView } from '@/lib/admin-page';
import type { OrderDetailView, Row2 } from '@/lib/admin-orders/detail';
import type { CommandSpec } from '@/lib/admin-orders/spec';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { PageHead } from '../shell/ShellParts';
import { ShellIcon } from '../shell/ShellIcon';
import { AlertExplain } from './AlertExplain';
import { ErpOrderPanel } from './ErpOrderPanel';
import { ArchiveNote, CommandButton, DetailGrid, MoreMenu, NoteForm } from './OrderCommands';
import { InvoicePrintMenu } from './InvoicePrintMenu';
import { invoicePrintDict, withInvoice } from '@/lib/admin-invoices/i18n';
import { Chips } from './OrderTable';
import { CourierScoreCard } from './CourierScoreCard';
import { RiskPanel } from './RiskPanel';
import { SupportExplain } from './SupportExplain';

function Kv({ rows }: { rows: Row2[] }) {
  return (
    <div className="a2-kv2">
      {rows.map((r) => (
        <Fragment key={r.label}>
          <span>{r.label}</span>
          <span className={r.mono ? 'a2-mono' : undefined}>{r.strong ? <b>{r.value}</b> : r.value}</span>
        </Fragment>
      ))}
    </div>
  );
}

function Card({ title, right, children, testId, sub }: { title: ReactNode; right?: ReactNode; children: ReactNode; testId?: string; sub?: string }) {
  return (
    <section className="a2-card" data-testid={testId}>
      <div className="a2-ch">
        <div>
          <h2 className="a2-h3">{title}</h2>
          {sub ? <div className="a2-cs">{sub}</div> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Buttons({ specs, size, open }: { specs: CommandSpec[]; size?: 'sm'; open: string | null }) {
  return (
    <>
      {specs.map((s) => (
        <CommandButton key={s.id} spec={s} size={size} open={open === s.id} />
      ))}
    </>
  );
}

// Follow-up 500: "Print invoice" (paper, roll, picture) with the print button's own words.
function InvoicePrint({ view, at }: { view: AdminView; at: { orderId: string; number: string } }) {
  const iv = withInvoice(view);
  const d = iv.dict;
  return (
    <InvoicePrintMenu
      dict={invoicePrintDict(iv, t(d, 'orders.detail.invoiceOff'))}
      orderId={at.orderId}
      number={at.number}
      label={t(d, 'orders.detail.printInvoice')}
      labels={{ page: t(d, 'inv.one.page'), roll: t(d, 'inv.one.roll'), jpg: t(d, 'inv.one.jpg') }}
      busyLabel={t(d, 'inv.printing')}
    />
  );
}

// S16 · PR 348: `extra` — cards the page adds after the money card (the order's profit, for people who may see the books).
export function OrderDetailPage({ view, o, open, notice, extra }: { view: AdminView; o: OrderDetailView; open: string | null; notice?: ReactNode; extra?: ReactNode }) {
  const d = view.dict;
  const more = t(d, 'orders.detail.more');
  const right = (
    <>
      <Buttons specs={o.primary} open={open} />
      {o.invoice ? (
        <a className="a2-btn" href={o.invoice} target="_blank" rel="noopener" data-testid="order-invoice">
          <ShellIcon name="file" size={15} />
          {t(d, 'orders.detail.invoice')}
        </a>
      ) : null}
      {o.invoicePrint ? <InvoicePrint view={view} at={o.invoicePrint} /> : null}
      <MoreMenu label={more} specs={o.more} open={open} />
    </>
  );
  const sub = (
    <span className="a2-osub">
      <Chips chips={o.chips} />
      {/* a2-mute, not a2-faint: when it was faint, Lighthouse's colour contrast failed on it (it is real information). */}
      <span className="a2-mute">{`${o.placed} · ${o.source}`}</span>
      {o.reorderOf ? (
        <Link className="a2-lnk a2-xs" href={`/admin/orders/${o.reorderOf.id}`} data-testid="order-reorder-of">
          {t(d, 'orders.reorderOf', { number: o.reorderOf.number })}
        </Link>
      ) : null}
    </span>
  );
  const crumb = (
    <Link href="/admin/orders" className="a2-lnk lm-back">
      <ShellIcon name="cl" size={14} />
      {t(d, 'orders.page.all')}
    </Link>
  );
  const title = `${o.number} · ${o.name ? `${o.name} · ` : ''}${o.total}`;

  const main = [
    <Card key="items" testId="order-items" title={`${t(d, 'orders.items.title')} · ${o.units}`} right={o.addLine ? <CommandButton spec={o.addLine} size="sm" open={open === o.addLine.id} /> : undefined}>
      <div className="a2-lines">
        {o.items.map((i) => (
          <div key={i.id} className={`a2-prow${i.removed ? ' a2-gone' : ''}`}>
            <div className="a2-prt">
              <b>{i.name}</b>
              <span>{i.sub}</span>
            </div>
            <span className="a2-pru">{i.qty}</span>
            <span className="a2-prs">{i.total}</span>
            {/* PR 127 follow-up 215: a line added after the order was placed can be taken out (it stays on the record) */}
            {i.remove ? <CommandButton spec={i.remove} size="sm" open={open === i.remove.id} /> : null}
          </div>
        ))}
      </div>
      <div className="a2-hr" />
      <div className="a2-tot">
        {o.totals.map((r) => (
          <Fragment key={r.label}>
            <span className={r.strong ? 't' : undefined}>{r.label}</span>
            <span className={r.strong ? 't' : undefined}>{r.value}</span>
          </Fragment>
        ))}
      </div>
    </Card>,
    <Card key="customer" testId="order-customer" title={t(d, 'orders.cust.title')}>
      <Kv rows={o.customer} />
      {o.location ? (
        // follow-up 324: the point the customer shared for the rider, opened on the owner's map (a new tab)
        <div className="a2-ovoice" data-testid="order-location">
          <div className="a2-xs a2-mute a2-b">{t(d, 'orders.cust.locationTitle')}</div>
          <a className="a2-btn a2-oloc" href={o.location.href} target="_blank" rel="noopener noreferrer" data-testid="order-location-map">
            <ShellIcon name="ext" size={15} />
            <span>{t(d, 'orders.cust.location', { point: o.location.text })}</span>
          </a>
        </div>
      ) : null}
      {o.voice ? (
        <div className="a2-ovoice" data-testid="order-voice">
          <div className="a2-xs a2-mute a2-b">
            {t(d, 'orders.voice.title')} · <span className={`a2-pill ${o.voice.low ? 'warn' : 'info'}`}>{t(d, o.voice.low ? 'orders.flag.voiceCall' : 'orders.flag.voice')}</span>
          </div>
          <p className="a2-sm">{o.voice.words}</p>
          <div className="a2-xs a2-mute">{o.voice.sure}</div>
          {o.voice.audio ? (
            <audio controls preload="none" src={o.voice.audio} className="a2-ovoice-play" data-testid="order-voice-play">
              {t(d, 'orders.voice.play')}
            </audio>
          ) : (
            <div className="a2-xs a2-mute">{t(d, 'orders.voice.notKept')}</div>
          )}
        </div>
      ) : null}
      {o.history.recent.length ? (
        <div className="a2-ohist" data-testid="order-history">
          <div className="a2-xs a2-mute a2-b">{t(d, 'orders.hist.recent')}</div>
          {o.history.recent.map((h) => (
            <Link key={h.href} className="a2-prow" href={h.href}>
              <div className="a2-prt">
                <b>{h.number}</b>
                <span>{h.placed}</span>
              </div>
              <span className={`a2-pill ${h.tone}`}>{h.status}</span>
              <span className="a2-prs">{h.total}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </Card>,
    // PR 605 follow-up 214: a gift order's own card after the customer (the receiver)
    ...(o.gift
      ? [
          <Card key="gift" testId="order-gift" title={t(d, 'orders.gift.title')} sub={t(d, 'orders.gift.sub')}>
            <Kv rows={o.gift} />
          </Card>,
        ]
      : []),
    <Card key="courier" testId="order-courier" title={t(d, 'orders.courier.title')} right={<Chips chips={[o.courier.chip]} />}>
      <Kv rows={o.courier.rows} />
    </Card>,
    // PR 610, 611 (ERP contract v6): the ERP part after the courier; it draws nothing in v5
    <ErpOrderPanel key="erp" orderId={o.id} currency={o.currency} view={view} />,
    // S06 · PR 160: the risk card (demo V12.3: after the courier, before the money)
    <RiskPanel key="risk" order={{ id: o.id, number: o.number, currency: o.currency }} view={view} />,
    // S28 · PR 662: the courier score out of 10 (staff only; nothing while the switch is off)
    <CourierScoreCard key="courier-score" order={{ id: o.id }} view={view} />,
    <SupportExplain key="explain" orderId={o.id} view={view} />,
    ...o.reviews.map((r) => (
      <Card key={r.id} testId="order-review" title={r.title} sub={`${r.severity ? `${r.severity} · ` : ''}${r.at}`} right={<span className={`a2-pill ${r.open ? 'warn' : 'ok'}`}>{t(d, r.open ? 'orders.review.open' : 'orders.review.decided')}</span>}>
        {r.why ? <div className="a2-sm">{r.why}</div> : null}
        {r.matched.length ? (
          <div className="a2-lines">
            <div className="a2-xs a2-mute a2-b">{t(d, 'orders.review.matched')}</div>
            {r.matched.map((m) => (
              <Link key={m.href} className="a2-prow" href={m.href}>
                <div className="a2-prt">
                  <b>{m.number}</b>
                </div>
                <span className={`a2-pill ${m.tone}`}>{m.status}</span>
              </Link>
            ))}
          </div>
        ) : null}
        {/* S06 · PR 521: one click explains the alert */}
        {r.explain ? <AlertExplain e={r.explain} /> : null}
        {/* S15 · PR 329: a plain AI paragraph on why the alert fired, grounded only in the panel above — never a decision */}
        {r.aiNote ? (
          <div className="a2-note a2-mt12" role="note" data-testid="review-ai-note">
            <ShellIcon name="spark" size={15} />
            <span>
              <b className="a2-blk">{t(d, 'orders.review.aiNote.label')}</b>
              <span className="a2-blk">{r.aiNote}</span>
            </span>
          </div>
        ) : null}
        {/* S06 · PR 543: what the team did with reviews like this one */}
        {r.learned ? (
          <div className="a2-note a2-mt12" role="note" data-testid="review-learned">
            <ShellIcon name="info" size={15} />
            <span>{r.learned}</span>
          </div>
        ) : null}
        {r.specs.length ? (
          <div className="a2-cmds a2-mt12">
            <Buttons specs={r.specs} size="sm" open={open} />
          </div>
        ) : null}
        {r.never && r.open ? <div className="a2-xs a2-mute a2-mt12">{r.never}</div> : null}
      </Card>
    )),
    <Card key="money" testId="order-money" title={t(d, 'orders.money.title')} right={<Chips chips={[o.money.chip]} />}>
      {o.money.rows.length ? (
        o.money.rows.map((r, i) => (
          <div key={i} className="a2-rule">
            <span>
              {r.title}
              <span className="a2-xs a2-mute a2-blk">{r.sub}</span>
            </span>
            <span className="a2-xs a2-mute">{r.at}</span>
          </div>
        ))
      ) : (
        <div className="a2-sm a2-mute">{o.money.empty}</div>
      )}
      <div className="a2-note">
        <ShellIcon name="info" size={15} />
        <span>{t(d, 'orders.money.never')}</span>
      </div>
    </Card>,
  ];

  const side = (
    <Card testId="order-timeline" title={t(d, 'orders.tl.title')} sub={t(d, 'orders.tl.sub')}>
      {o.canNote ? <NoteForm url={o.noteUrl} maxLength={o.noteMax} labels={{ label: t(d, 'orders.notes.label'), placeholder: t(d, 'orders.notes.placeholder'), add: t(d, 'orders.notes.add'), done: t(d, 'orders.notes.done') }} /> : null}
      {o.notes.length ? (
        <div className="a2-onotes" data-testid="order-notes">
          {o.notes.map((n) => (
            <div key={n.id} className="a2-onote">
              <p>{n.body}</p>
              <span className="a2-xs a2-mute">{`${n.who} · ${n.at}`}</span>
              {n.archiveUrl ? <ArchiveNote url={n.archiveUrl} label={t(d, 'orders.notes.archive')} done={t(d, 'orders.notes.archived')} /> : null}
            </div>
          ))}
        </div>
      ) : null}
      {o.timeline.length ? (
        <div className="a2-tl">
          {o.timeline.map((e) => (
            <div key={e.id} className={`a2-tli${e.tone ? ` ${e.tone}` : ''}`}>
              <b>{e.title}</b>
              <span>{`${e.at} · ${e.who}`}</span>
              {e.detail ? <p>{e.detail}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="a2-sm a2-mute">{t(d, 'orders.tl.empty')}</div>
      )}
    </Card>
  );

  return (
    <div className="a2-z" data-testid="order-detail" data-order={o.number} data-lm-ready="">
      <PageHead view={view} place={locateKey('order')} title={title} sub={sub} right={right} crumb={crumb} />
      {notice}
      {o.bands.map((b) => (
        <div key={b.id} className={`a2-band ${b.kind}`} data-testid={`band-${b.id}`}>
          <ShellIcon name={b.kind === 'locked' ? 'lock' : b.kind === 'stale' ? 'clock' : 'alert'} size={16} />
          <span>{b.text}</span>
          {b.specs.length ? (
            <span className="a2-gap8 a2-bandr">
              <Buttons specs={b.specs} size="sm" open={open} />
            </span>
          ) : null}
          {b.link ? (
            <span className="a2-gap8 a2-bandr">
              <Link className="a2-btn sm" href={b.link.href} data-testid={`band-${b.id}-link`}>
                {b.link.label}
              </Link>
            </span>
          ) : null}
        </div>
      ))}
      {o.flags.length ? (
        <div className="a2-oflags">
          <Chips chips={o.flags} />
        </div>
      ) : null}
      <DetailGrid labels={{ aria: t(d, 'orders.detail.tabs'), main: t(d, 'orders.detail.details'), side: t(d, 'orders.detail.timeline') }} main={extra ? [...main, extra] : main} side={side} />
    </div>
  );
}
