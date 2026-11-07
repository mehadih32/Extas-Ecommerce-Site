// PR 41 · follow-up 21 — mounts the cards' back view and Quick add (CardDesk) on a page with product cards, with the
// page's words, the store's `card.desk` switches and the bag's own add behaviour. Draws nothing when both are off.
// Follow-up 113: with `pdp.usualSize` on, the usual size is marked on Quick add and a card add keeps it.
import { bagSettings } from '@/lib/shop/bag';
import { readPageSettings, type ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { CardDesk } from './CardDesk';
import { CARD_SIZES } from './ProductCard';

export async function CardDeskMount({ c }: { c: ShopContext }) {
  const [set, bag] = await Promise.all([readPageSettings(['card.desk', 'pdp.usualSize', 'catalogue.sizeCharts.diagramFor'], c.storeId), bagSettings(c.storeId)]);
  const desk = set['card.desk'];
  if (!desk.altView && !desk.quickAdd) return null;
  const t = c.t;
  // follow-up 113: "Your size" on the Quick add buttons, with the product page's own switch and words
  const u = set['pdp.usualSize'];
  const usual = desk.quickAdd && u.on ? { days: u.days, diagramFor: set['catalogue.sizeCharts.diagramFor'], aria: t('usualSize.aria') } : null;
  return (
    <CardDesk
      set={desk}
      behaviour={bag['bag.addBehaviour']}
      bagHref={hrefIn(c.lang, ROUTES.bag)}
      lang={c.lang}
      bnDigits={c.bnDigits}
      sizes={CARD_SIZES}
      usual={usual}
      words={{
        label: t('cardQuick.label'),
        group: t('cardQuick.group'),
        add: t('cardQuick.add'),
        soldOut: t('cardQuick.soldOut'),
        more: t('cardQuick.more'),
        bag: {
          added: t('bag.toast.added'),
          already: t('bag.toast.already'),
          error: t('bag.toast.error'),
          stock: t('bag.toast.stock'),
          tooMany: t('bag.toast.tooMany'),
          notForSale: t('bag.toast.notForSale'),
        },
      }}
    />
  );
}
