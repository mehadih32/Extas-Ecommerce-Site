'use client';
// PR 61 — the price row (Blueprint D3.5 "Option B", demo 30-product.js pdp_headPrice / pdp_priceSide / pdp_payWords):
// the price, a thick bar, then the saving of a discounted product, or free home delivery, or the payment line — always
// one row (47). The price follows the choice: the chosen piece's own price, else the lowest of the colour. Free
// delivery steps down to its short words when the row runs out of room (the fit pass, PdpEffects).
import { Icon } from '../Icon';
import { priceSide } from '@/lib/shop/pdp-price';
import { priceFor } from '@/lib/shop/product-model';
import type { PdpPriceSettings } from '@extas/settings';
import { usePdp } from './PdpRoot';

export function PdpPrice({ set, freeDelivery, payWords }: { set: PdpPriceSettings; freeDelivery: boolean; payWords: string[] }) {
  const { m, choice, w, set: s } = usePdp();
  const p = priceFor(m, choice);
  if (!p) return null;
  const discounted = !!p.was && !!p.pct;
  const side = priceSide({ discounted, freeDelivery, payWords }, set);
  const after = discounted && set.discountAfterBar;
  const sweep = s.sweep.freeDelivery ? ' sweep' : '';
  return (
    <div className={`pdp-prow${discounted ? ' disc' : ''}${after ? ' dafter' : ''}${freeDelivery ? ' freed' : ''}`} data-testid="price-row" data-fitrow="">
      <span className="pdp-pmain">
        <span className="price pdp-pbig">{p.now}</span>
        {discounted && !after ? (
          <span className="pdp-psave">
            <span className="strike">{p.was}</span>
            <span className="tag sale pdp-pct">{p.pct}</span>
            <span className="pdp-saved">{p.save}</span>
          </span>
        ) : null}
      </span>
      {side ? <span className="pdp-pbar" aria-hidden="true" /> : null}
      {side === 'discount' ? (
        <span className="pdp-pside dsc">
          <span className="pdp-pdisc">
            <span className="pdp-pd1">
              <span className="strike">{p.was}</span>
              <span className="tag sale pdp-pct">{p.pct}</span>
            </span>
            <span className="pdp-pd2">
              <b className="pdp-saved">{p.save}</b>
            </span>
          </span>
        </span>
      ) : side === 'free' ? (
        <span className="pdp-pside free">
          <span className={`pdp-fd${sweep}`}>
            <Icon name="truck" size={25} />
            <b className="pdp-fx pdp-fitt" data-fx-max="1" data-l="0">
              <span className="pf pf0">{w('price.free')}</span>
              <span className="pf pf1">{w('price.freeShort')}</span>
            </b>
          </span>
        </span>
      ) : side === 'pay' ? (
        <span className="pdp-pside">
          <Icon name="cash" size={21} />
          <span className="pdp-psmall pay-hl-none pdp-payfit" data-testid="pay-line">
            {payWords.map((x, i) => (
              <span key={`${i}-${x}`} className="pdp-pm">
                {i ? <span className="pdp-bar">|</span> : null}
                {x}
              </span>
            ))}
          </span>
        </span>
      ) : null}
    </div>
  );
}
