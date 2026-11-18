// PR 1064 (prototype v5, Orders › Processing): the card grid. One card per order that needs a person: number, name, phone and
// age, the amount, what is wrong (the flags), the pieces, and the order's own commands right on the card (the same commands
// and dialogs as the order page; the order service checks every one again). Drawn from the order page's own detail read, so
// a card never shows a command the person may not use. Nothing here changes an order by itself.
import Link from 'next/link';
import type { AdminView } from '@/lib/admin-page';
import type { OrderDetailView } from '@/lib/admin-orders/detail';
import { t } from '@/lib/i18n';
import { ShellIcon } from '../shell/ShellIcon';
import type { CommandSpec } from '@/lib/admin-orders/spec';
import { CommandButton, MoreMenu } from './OrderCommands';
import { Chips } from './OrderTable';

// PR 1120 (prototype v5): the card's own row is Approve, Ask for advance, No answer, Call and Cancel in this order; every
// other command of the order stays one press away under "More" (nothing is lost, the dialogs and checks are the same).
const ROW = ['confirm', 'advanceRequest', 'cancel'] as const;
const RENAME: Record<string, string> = { confirm: 'orders.proc.approve', advanceRequest: 'orders.proc.askAdvance', cancel: 'orders.proc.cancel' };

/** The prototype's Cancel on a card is a quiet button: the same command without its red tone and icon. */
function plain(s: CommandSpec): CommandSpec {
  const c = { ...s };
  delete c.tone;
  delete c.icon;
  return c;
}

export function ProcessingCards({ view, cards, noAnswer = {} }: { view: AdminView; cards: OrderDetailView[]; /** PR 1120: order id → the "No answer" dialog on its open call (none: no button). */ noAnswer?: Record<string, CommandSpec> }) {
  const d = view.dict;
  const named = (s: CommandSpec): CommandSpec => (RENAME[s.id] ? { ...s, label: t(d, RENAME[s.id]!) } : s);
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
              <div className="a2-xs a2-mute">{t(d, 'orders.proc.pay', { pay: o.money.chip.label, units: o.units })}</div>
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
                <div key={i.id}>{`${i.name} · ${i.sub} ${i.qty}`}</div>
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
            {(() => {
              const all = [...o.primary, ...o.more];
              const pick = (id: string) => all.find((s) => s.id === id);
              const [approve, advance, cancel] = ROW.map(pick);
              const rest = all.filter((s) => !(ROW as readonly string[]).includes(s.id));
              const na = noAnswer[o.id];
              return (
                <>
                  {approve ? <CommandButton spec={named(approve)} size="sm" /> : null}
                  {advance ? <CommandButton spec={named(advance)} size="sm" /> : null}
                  {na ? <CommandButton spec={na} size="sm" /> : null}
                  {o.contact.callHref ? (
                    <a className="a2-btn sm" href={o.contact.callHref} data-testid="processing-call">
                      <ShellIcon name="phone" size={15} />
                      {t(d, 'orders.detail.call')}
                    </a>
                  ) : null}
                  {cancel ? <CommandButton spec={plain(named(cancel))} size="sm" /> : null}
                  {rest.length ? <MoreMenu label={t(d, 'orders.proc.more')} specs={rest} /> : null}
                </>
              );
            })()}
          </div>
        </article>
      ))}
    </div>
  );
}
