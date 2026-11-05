// S22 · PR 624 (CN-034) — the Messenger button beside the shop's other ways to reach it: on the product page, the help
// pages, the contact page and the customer's order page. It opens the store's own Facebook Page in Messenger
// (lib/shop/messenger.ts) with a "ref" naming the place and what was looked at. Drawn only while the owner has it on,
// ticked for that place, with a Page set (`support.messengerButton`, `contact.messenger`); otherwise nothing at all.
import type { MessengerPlace } from '@extas/settings';
import type { ShopContext } from '@/lib/shop/context';
import { messengerLink } from '@/lib/shop/messenger';
import { MessengerGlyph } from './Icon';

export function MessengerButton({ c, place, detail, className = '', card }: { c: ShopContext; place: MessengerPlace; detail?: string | null; className?: string; card?: string }) {
  const ms = messengerLink(c.s['support.messengerButton'], { page: c.s['contact.messenger'], facebook: c.s['social.facebook'], place, lang: c.lang, detail });
  if (!ms) return null;
  const button = (
    <div className={`ms-box ${className}`.trim()} data-testid={`ms-${place}`}>
      <a className="wa-btn btn-block ms-btn" href={ms.href} target="_blank" rel="noopener">
        <MessengerGlyph size={19} />
        <span>{ms.label}</span>
      </a>
      <p className="xs muted ms-hint">{ms.hint}</p>
    </div>
  );
  if (!card) return button;
  return (
    <section className="card p20" aria-label={card}>
      <h2 className="h3">{card}</h2>
      {button}
    </section>
  );
}
