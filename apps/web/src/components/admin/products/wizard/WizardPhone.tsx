'use client';
// S28 · PR 1031 — the phone beside the wizard (prototype v5): the product as a shopper's phone shows it — front photo, brand, name,
// price (with the crossed-out price), the colours and sizes kept on the shop and an "Add to bag" button — and a short note of what
// is still missing. It follows what is typed in the steps, before anything is saved to the shop.
import { useState } from 'react';
import { ResponsiveImage } from '@/components/media/ResponsiveImage';
import { t } from '@/lib/i18n';
import { formatMoney, nameIn } from '../model';
import type { Ctx } from './ctx';

export function WizardPhone({ c }: { c: Ctx }) {
  const { d, data, live, lang } = c;
  const colours = data.colours.filter((x) => !live.hiddenColourIds.includes(x.id));
  const [pick, setPick] = useState(0);
  const cur = colours[Math.min(pick, Math.max(colours.length - 1, 0))];
  const photo = cur ? c.photos.gallery.find((g) => g.colourId === cur.id && g.role === 'FRONT') ?? c.photos.gallery.find((g) => g.colourId === cur.id) : c.photos.gallery[0];
  const img = photo ? c.photos.images[photo.assetId] : undefined;
  const brand = c.lists.brands.find((b) => b.id === live.brandId)?.name ?? null;
  const sizes = data.sizes.filter((s) => !live.hiddenSizeIds.includes(s.id));
  const price = live.priceMinor ?? data.priceMinor;
  const compare = live.compareAtMinor ?? data.compareAtMinor;
  const priceText = price ? formatMoney(price, c.money) : t(d, 'products.wiz.noPrice');
  const showWas = !!price && (compare ?? 0) - price > 0;
  const was = showWas ? <s>{formatMoney(compare ?? 0, c.money)}</s> : null;
  const stock = (sid: string) => (cur ? (cur.bySize[sid] ?? 0) : 0);
  const gaps = [!live.name.trim() ? 'name' : null, !colours.length ? 'colours' : null, colours.some((x) => !x.front) ? 'photos' : null, !price ? 'price' : null].filter((x): x is string => !!x);

  return (
    <aside className="wzp-side" aria-label={t(d, 'products.wiz.preview')} data-testid="wizard-preview">
      <div className="wzp-phh">
        <b>{t(d, 'products.wiz.phH')}</b>
        <span className="ad-mini">{t(d, 'products.wiz.phSub')}</span>
      </div>
      <div className="wzp-ph">
        <div className="wzp-phbar">
          <span>{t(d, 'products.wiz.ph.time')}</span>
          <span>{t(d, 'products.wiz.ph.shop')}</span>
        </div>
        <div className="wzp-phimg" style={{ background: img?.dominantColor ?? 'var(--lm-sf2)' }}>
          {img ? <ResponsiveImage image={img} slot="thumb" sizes="300px" alt={live.name} /> : null}
          {!img ? <span className="no">{t(d, 'products.wiz.noPhoto')}</span> : null}
        </div>
        <div className="wzp-dots" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <i key={i} className={i === 0 ? 'on' : undefined} />
          ))}
        </div>
        <div className="wzp-phb">
          {brand ? <div className="wzp-brand">{brand}</div> : null}
          <div className="wzp-name">{live.name || t(d, 'products.wiz.noName')}</div>
          <div className="wzp-price">
            {priceText}
            {was}
          </div>
          <div className="wzp-phsw" role="group" aria-label={t(d, 'products.wiz.ph.colours')}>
            {colours.map((x, i) => (
              <button key={x.id} type="button" className={i === pick ? 'on' : undefined} style={{ background: x.hex }} aria-label={live.colourNames[x.id] || nameIn(lang, x)} aria-pressed={i === pick} onClick={() => setPick(i)} />
            ))}
          </div>
          <div className="wzp-phsz">
            {sizes.map((s) => (
              <span key={s.id} className={stock(s.id) === 0 ? 'out' : undefined}>
                {s.label}
              </span>
            ))}
          </div>
          <button type="button" className="wzp-cta" tabIndex={-1} aria-hidden="true">
            {t(d, 'products.wiz.cart')}
          </button>
          {gaps.length ? (
            <ul className="wzp-li">
              {gaps.map((g) => (
                <li key={g}>{t(d, `products.wiz.ph.gap_${g}`)}</li>
              ))}
            </ul>
          ) : null}
          <div className="wzp-note">{t(d, 'products.wiz.ph.note')}</div>
        </div>
      </div>
    </aside>
  );
}
