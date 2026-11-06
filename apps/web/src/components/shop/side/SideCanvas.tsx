// S02 · PR 596 — the side canvas (Website › Side canvas; demo #/admin/side-canvas "দুই পাশের জায়গা"): the owner's zones in
// the empty space left and right of the page on wide computer screens. Drawn hidden; the client fitter (SideFit) shows
// a zone only on a computer with a mouse, only where the gutter has room (it scales down to fit and hides below half
// its size), never over the content, the header or the footer, and only after the page has loaded. A phone or a tablet
// never shows one and never loads its picture (lazy images that stay hidden). Off as shipped: nothing is drawn.
import type { SideCanvas as SideSet } from '@extas/settings';
import { photoFor, productName } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { productPath } from '@/lib/shop/home-model';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import type { SideItem } from '@/lib/shop/side-canvas';
import { Icon } from '../Icon';
import { ProductPicture } from '../ProductPicture';
import { SideFit } from './SideFit';
import './side.css';

const inLang = (c: ShopContext, w: { en: string; bn: string }) => (c.lang === 'bn' ? w.bn || w.en : w.en || w.bn);
const linkIn = (c: ShopContext, href: string) => (href.startsWith('/') ? hrefIn(c.lang, href) : href);

function Inside({ c, it }: { c: ShopContext; it: SideItem }) {
  const z = it.zone;
  const text = inLang(c, z.text);
  if (z.kind === 'teaser')
    return (
      <span className="sc-teaser">
        <Icon name="tag" size={18} />
        <span>{text}</span>
      </span>
    );
  const alt = inLang(c, z.alt) || (it.card ? productName(it.card, c.lang) : it.title);
  const colour = it.card?.colours[0];
  return (
    <>
      {it.card ? (
        <ProductPicture garment={it.card.garment} hex={colour?.hex ?? ''} photo={photoFor(it.card, colour?.key)} ratio="ratio-34" alt={alt} lang={c.lang} sizes={`${z.width}px`} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- the owner's own picture from an https address, any size
        <img className="sc-img" src={z.ref} alt={alt} loading="lazy" decoding="async" />
      )}
      {text || it.title ? <span className="sc-line">{text || it.title}</span> : null}
    </>
  );
}

export function SideCanvas({ c, items, set }: { c: ShopContext; items: SideItem[]; set: SideSet }) {
  if (!set.enabled || !items.length) return null;
  return (
    <div className="sc-canvas" aria-label={c.t('side.label')} role="complementary" data-testid="side-canvas">
      {items.map((it) => {
        const z = it.zone;
        const href = z.href || (z.kind === 'product' && it.card ? productPath(c.s['naming.productPathPrefix'], it.card.slug) : z.kind === 'category' ? ROUTES.category(z.ref) : '');
        const cls = `sc-zone ${z.style === 'full' ? 'sc-full' : 'sc-card'} sc-${z.kind}`;
        const data = { 'data-zone': z.id, 'data-side': z.side, 'data-top': z.top, 'data-w': z.width, 'data-h': z.height, 'data-mode': z.mode };
        return href ? (
          <a key={z.id} className={cls} href={linkIn(c, href)} {...data}>
            <Inside c={c} it={it} />
          </a>
        ) : (
          <div key={z.id} className={cls} {...data}>
            <Inside c={c} it={it} />
          </div>
        );
      })}
      <SideFit gap={set.gap} float={set.float} minWidth={set.minWidth} />
    </div>
  );
}
