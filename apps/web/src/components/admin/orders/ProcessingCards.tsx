// PR 974 (prototype v5, Orders › Processing): the card grid. One card per order that needs a person: number, name, phone and
// age, the amount, what is wrong (the flags), the pieces, and the order's own commands right on the card (the same commands
// and dialogs as the order page; the order service checks every one again). Drawn from the order page's own detail read, so
// a card never shows a command the person may not use. Nothing here changes an order by itself.
import Link from 'next/link';
import type { AdminView } from '@/lib/admin-page';
import type { OrderDetailView } from '@/lib/admin-orders/detail';
import { t } from '@/lib/i18n';
import { ShellIcon } from '../shell/ShellIcon';
import { CommandButton } from './OrderCommands';
import { Chips } from './OrderTable';

export function ProcessingCards({ view, cards }: { view: AdminView; cards: OrderDetailView[] }) {
  const d = view.dict;
  return (
    <div className="o6-cards" data-testid="processing-cards">
      {cards.map((o) => (
        <article key={o.id} className="a2-card o6-q" data-testid="processing-card" data-order={o.number}>
          <div className="o6-qh">
            <div className="o6-grow">
              <Link className="a2-lnk a2-b" href={`/admin/orders/${o.id}`}>
                {o.number}
              </Link>
              <div className="o6-qn">{o.name}</div>
              <div className="a2-xs a2-mute">{[o.contact.phone, o.placed].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="o6-qt">
              <b>{o.total}</b>
            </div>
          </div>
          {o.flags.length ? (
            <div className="o6-qf">
              <Chips chips={o.flags} />
            </div>
          ) : null}
          <div className="a2-sm">
            {o.items
              .filter((i) => !i.removed)
              .map((i) => (
                <div key={i.id}>{`${i.name} · ${i.sub} × ${i.qty}`}</div>
              ))}
          </div>
          {o.bands
            .filter((b) => b.text)
            .map((b) => (
              <div key={b.id} className={`a2-note o6-qb ${b.kind}`}>
                <span>{b.text}</span>
                {b.specs.length ? (
                  <span className="a2-cmds">
                    {b.specs.map((s) => (
                      <CommandButton key={s.id} spec={s} size="sm" />
                    ))}
                  </span>
                ) : null}
              </div>
            ))}
          <div className="a2-cmds o6-qa">
            {o.primary.map((s) => (
              <CommandButton key={s.id} spec={s} size="sm" />
            ))}
            {o.contact.callHref ? (
              <a className="a2-btn sm" href={o.contact.callHref} data-testid="processing-call">
                <ShellIcon name="phone" size={15} />
                {t(d, 'orders.detail.call')}
              </a>
            ) : null}
            {o.more.map((s) => (
              <CommandButton key={s.id} spec={s} size="sm" />
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
