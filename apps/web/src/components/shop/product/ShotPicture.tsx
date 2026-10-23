// PR 54 — one picture of the product page (demo 02-core.js productImg with a view): the owner's photo when there is
// one, at the size the place needs (`media.image.slots`: thumb, main, zoom), otherwise the garment drawing of that view
// in the colour's own hex. No hooks, so the gallery, the thumbnails, the viewer and the bars all draw it the same way.
import type { CSSProperties } from 'react';
import { ResponsiveImage, altFor } from '@/components/media/ResponsiveImage';
import { drawingBackground, garmentArt } from '@/lib/shop/garment-art';
import type { PdpShot } from '@/lib/shop/product-model';

export function ShotPicture({
  shot,
  garment,
  hex,
  slot,
  sizes,
  alt,
  lang,
  ratio = 'ratio-45',
  priority = false,
  className = 'pimg',
  style,
}: {
  shot: PdpShot;
  garment: string | null;
  hex: string;
  slot: string;
  sizes: string;
  alt: string;
  lang: 'en' | 'bn';
  ratio?: 'ratio-45' | 'ratio-34' | 'ratio-11' | null;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const art = shot.photo ? '' : garmentArt(garment, hex, shot.draw);
  return (
    <div className={`${className}${ratio ? ` ${ratio}` : ''}${shot.photo ? ' has-photo' : ''}`} style={{ background: drawingBackground(hex, shot.draw), ...style }}>
      {shot.photo ? (
        <ResponsiveImage image={shot.photo} slot={slot} sizes={sizes} alt={altFor(shot.photo, lang, alt)} priority={priority} />
      ) : art ? (
        <svg className="garment" viewBox="0 0 200 222" {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })} dangerouslySetInnerHTML={{ __html: art }} />
      ) : null}
    </div>
  );
}
