'use client';
// PR 117 — step 2, "Delivery" (demo 51-checkout.js co_delivery): before an address it says the charge appears once the
// address is written; while the finished line is read, that it is being read; then the band the gazetteer found, with
// the place it read ("Mirpur 12 · Dhaka"), so the customer confirms it by sight (SIM-F-003 growth idea).
import type { DeliveryView, PlaceName } from '@extas/checkout/pure';
import type { ShopLang } from '@/lib/shop/lang';
import { Icon } from '../Icon';

export interface DeliveryStepProps {
  delivery: DeliveryView;
  /** A finished line is being read right now. */
  reading: boolean;
  /** The address box holds a whole address (its shortest length): the page says it is reading it. */
  hasAddress: boolean;
  lang: ShopLang;
  w: (key: string, vars?: Record<string, string | number>) => string;
}

/** A name in the page's language (the Bengali one when it exists). */
export const named = (lang: ShopLang, en: string, bn: string | null | undefined) => (lang === 'bn' && bn ? bn : en);

/** "Mirpur 12 · Dhaka": the place and the district that tells it apart. */
export function placeLine(lang: ShopLang, p: PlaceName | null): string {
  if (!p) return '';
  const own = named(lang, p.nameEn, p.nameBn);
  const parent = p.parentEn ? named(lang, p.parentEn, p.parentBn) : '';
  return parent && parent !== own ? `${own} · ${parent}` : own;
}

export function DeliveryStep({ delivery, reading, hasAddress, lang, w }: DeliveryStepProps) {
  if (delivery.state === 'found' && !reading) {
    const where = placeLine(lang, delivery.place);
    return (
      <div className="co-zone mt16" data-testid="co-zone-box">
        <Icon name="truck" size={22} />
        <div className="grow">
          <div className="h3" data-testid="co-zone">
            {named(lang, delivery.band.nameEn, delivery.band.nameBn)}
          </div>
          {where ? (
            <div className="small text2" data-testid="co-zone-place">
              {where}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <p className="co-fdays" data-testid="co-del-wait">
      <Icon name="info" size={14} />
      <span>{w(hasAddress ? 'del.reading' : 'del.write')}</span>
    </p>
  );
}
