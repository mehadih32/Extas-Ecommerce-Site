// PR 193 (CN-014 g; demo 98e-cn014.js ftEidBanner, B1.14) — the shop-wide strip about when orders come, on the home
// page and the bag: the Eid order-by date per band ("Order by 6 Mar for delivery before Eid — Dhaka city"), the
// pre-order line once every date passed (only with the owner's pre-order on), and the holiday notice. The words are the
// owner's settings (@extas/rules storefrontBanner); with both switches off, as shipped, nothing is drawn.
import type { ShopContext } from '@/lib/shop/context';
import { etaBanner } from '@/lib/rules-public';
import { Icon } from './Icon';

/** `wrap`: a class for a box around the strip (the home page's container), drawn only when there is a strip. */
export async function EtaBanner({ c, testId, wrap }: { c: ShopContext; testId: string; wrap?: string }) {
  const lines = await etaBanner({ storeId: c.storeId, locale: c.lang === 'bn' ? 'bn-BD' : 'en-BD' });
  if (!lines.length) return null;
  const strip = (
    <div className="sh-eta" role="note" data-testid={testId}>
      <Icon name="clock" size={16} />
      <div className="sh-eta-l">
        {lines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
    </div>
  );
  return wrap ? <div className={wrap}>{strip}</div> : strip;
}
