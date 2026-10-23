// PR 91, 93, 103 — a set's pictures. `SetPicture` (demo 02-core.js setImg): the pieces side by side, each the owner's
// front photo of the colour picked, else the garment drawing in that colour on its own tint — so the picture changes
// with every colour tapped. `HubPicture` (demo ca_setPhoto, card layout): the pieces laid over each other on the house
// background, for the sets landing page. No hooks: the server and the combo page's client part draw them the same way.
import type { ImageSource } from '@extas/media';
import type { ReactNode } from 'react';
import { ResponsiveImage, altFor } from '@/components/media/ResponsiveImage';
import { drawingBackground, garmentArt, type GarmentView } from '@/lib/shop/garment-art';
import type { ShopLang } from '@/lib/shop/lang';

export interface SetPart {
  garment: string | null;
  hex: string;
  photo: ImageSource | null;
  /** Which side of the drawing (the front, unless the gallery shows another view). */
  draw?: GarmentView;
  name: string;
}

function Art({ part, lang, sizes, slot }: { part: SetPart; lang: ShopLang; sizes: string; slot: string }) {
  if (part.photo) return <ResponsiveImage image={part.photo} slot={slot} sizes={sizes} alt={altFor(part.photo, lang, part.name)} />;
  const art = garmentArt(part.garment, part.hex, part.draw ?? 'front');
  return art ? <svg className="garment" viewBox="0 0 200 222" aria-hidden="true" dangerouslySetInnerHTML={{ __html: art }} /> : null;
}

export function SetPicture({
  parts,
  lang,
  alt,
  ratio = 'ratio-45',
  sizes,
  slot = 'card',
  children,
}: {
  parts: readonly SetPart[];
  lang: ShopLang;
  alt: string;
  ratio?: 'ratio-45' | 'ratio-11';
  sizes: string;
  slot?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`pimg ${ratio} cb-setpic`} role="img" aria-label={alt}>
      {parts.map((p, i) => (
        <div key={i} className={`cb-part${p.photo ? ' has-photo' : ''}`} style={{ background: drawingBackground(p.hex, p.draw ?? 'front') }}>
          <Art part={p} lang={lang} sizes={sizes} slot={slot} />
        </div>
      ))}
      {children}
    </div>
  );
}

export function HubPicture({ parts, lang, alt, children }: { parts: readonly SetPart[]; lang: ShopLang; alt: string; children?: ReactNode }) {
  return (
    <div className={`ca-ph ca-ph-card n${Math.min(parts.length, 3)}`} role="img" aria-label={alt}>
      {parts.slice(0, 3).map((p, i) => (
        <div key={i} className={`ca-pc p${i}`}>
          <div className="ca-art">
            <Art part={p} lang={lang} sizes="(min-width: 1024px) 18vw, 40vw" slot="card" />
          </div>
        </div>
      ))}
      {children}
    </div>
  );
}
