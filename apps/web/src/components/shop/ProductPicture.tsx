// PR 41 — a product's picture box (demo 02-core.js productImg): the owner's photo of that colour when one is uploaded,
// otherwise the drawing of the garment type in the colour's own hex, on a tint mixed from that colour. The box keeps
// its shape (`ratio-45` card, `ratio-34` category tile), so nothing moves when a photo arrives. The demo's
// "[ demo image ]" caption is left out: a real shop never prints it.
import type { ImageSource } from '@extas/media';
import type { ReactNode } from 'react';
import { ResponsiveImage, altFor } from '@/components/media/ResponsiveImage';
import { drawingBackground, garmentArt, type GarmentView } from '@/lib/shop/garment-art';
import type { ShopLang } from '@/lib/shop/lang';

export function GarmentDrawing({ garment, hex, view = 'front' }: { garment: string | null; hex: string; view?: GarmentView }) {
  const art = garmentArt(garment, hex, view);
  if (!art) return null;
  return <svg className="garment" viewBox="0 0 200 222" aria-hidden="true" dangerouslySetInnerHTML={{ __html: art }} />;
}

export function ProductPicture({
  garment,
  hex,
  photo,
  ratio = 'ratio-45',
  alt,
  lang,
  sizes,
  priority = false,
  view = 'front',
  children,
}: {
  garment: string | null;
  hex: string;
  photo: ImageSource | null;
  ratio?: 'ratio-45' | 'ratio-34' | 'ratio-11';
  alt: string;
  lang: ShopLang;
  sizes: string;
  priority?: boolean;
  /** Follow-up 21: which side of the drawing (the card's back view on a computer's hover). */
  view?: GarmentView;
  children?: ReactNode;
}) {
  return (
    <div className={`pimg ${ratio}${photo ? ' has-photo' : ''}`} style={{ background: drawingBackground(hex, view) }}>
      {photo ? (
        <ResponsiveImage image={photo} slot="card" sizes={sizes} alt={altFor(photo, lang, alt)} priority={priority} />
      ) : (
        <GarmentDrawing garment={garment} hex={hex} view={view} />
      )}
      {children}
    </div>
  );
}
