// S13 · PR 281 — the home page's festive section (demo 20-home.js hm_festive): the clock, a heading and the live
// festive Smart Rule's words — "Order by 6 Mar for delivery before the festival" before the last order times, its
// "after" words once every band passed — and, on a computer, the owner's link ("Shop the Eid edit"). Only while
// Marketing › Festive cut-off is on with the home page ticked (`marketing.festiveCutoff`, off as shipped) and a festive
// rule placed on the announcement is live; otherwise nothing is drawn. The heading is the owner's (`title`), else the
// rule's own name; every date and word comes from the rule. Follow-up (PR 281 / 214): with the customer's band known
// (his saved address or his started checkout) the line names his own last order time, otherwise every band's.
import type { ShopContext } from '@/lib/shop/context';
import { knownBand } from '@/lib/shop/known-band';
import { readPageSettings } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { festiveLines } from '@/lib/rules-public';
import { Icon } from '../Icon';

export async function HomeFestive({ c }: { c: ShopContext }) {
  if (!c.live) return null;
  const lines = await festiveLines({ storeId: c.storeId, place: 'home', locale: c.lang === 'bn' ? 'bn-BD' : 'en-BD', band: await knownBand(c.storeId) });
  if (!lines.length) return null;
  const { 'marketing.festiveCutoff': set } = await readPageSettings(['marketing.festiveCutoff'], c.storeId).catch(() => ({ 'marketing.festiveCutoff': null }));
  const title = set?.title?.[c.lang] ?? lines[0]!.name;
  const link = set?.linkHref && set.linkLabel ? { href: hrefIn(c.lang, set.linkHref), label: set.linkLabel[c.lang] } : null;
  return (
    <div className="container">
      <div className="tint hm-festive" role="note" data-testid="home-festive">
        <Icon name="clock" size={22} />
        <div className="grow">
          <p className="small bold">{title}</p>
          {lines.map((l) => (
            <p key={l.key} className="small text2" data-state={l.state}>
              {l.text}
            </p>
          ))}
        </div>
        {link ? (
          <a className="hm-more hide-m" href={link.href}>
            {link.label}
          </a>
        ) : null}
      </div>
    </div>
  );
}
