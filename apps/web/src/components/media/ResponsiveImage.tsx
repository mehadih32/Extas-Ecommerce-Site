// PR 24 — one product photo, the right size for the screen (owner spec §3.4, Blueprint A2.9.7):
// - <picture> with AVIF, then WebP, then the JPEG <img>; the browser takes the best it can read;
// - the sizes each place may use come from `media.image.slots` (a phone gets 400/800, a larger screen 800/1200; the
//   zoom size only on a larger screen, in the zoom viewer), never the 2000 px file on a phone;
// - width and height always set (no layout shift), a dominant-colour box until the photo arrives;
// - the first screen loads eagerly with high priority (`priority`), everything else lazily.
// No visible text: the alt text is the photo's own (altBn / altEn), chosen by the caller for the page language.
import type { CSSProperties } from 'react';
import { pictureSources, type ImageSource } from '@extas/media/delivery';

export interface ResponsiveImageProps {
  image: ImageSource;
  /** A key of `media.image.slots`: thumb, card, main, zoom … */
  slot: string;
  /** The `sizes` attribute: how wide the photo is drawn, e.g. "(max-width: 767px) 50vw, 25vw". */
  sizes: string;
  alt: string;
  /** First screen: load at once with high priority. */
  priority?: boolean;
  className?: string;
}

export function ResponsiveImage({ image, slot, sizes, alt, priority = false, className }: ResponsiveImageProps) {
  const markup = pictureSources(image, slot);
  const box: CSSProperties = {
    aspectRatio: `${image.ratio.width} / ${image.ratio.height}`,
    ...(image.dominantColor ? { backgroundColor: image.dominantColor } : {}),
  };
  if (!markup) {
    // Still being processed: the colour box holds the place, at the right shape.
    return <span role="img" aria-label={alt} className={className} style={{ display: 'block', ...box }} data-media-pending="" />;
  }
  return (
    <picture>
      {markup.sources.map((s) => (
        <source key={`${s.type}|${s.media ?? ''}`} type={s.type} media={s.media} srcSet={s.srcSet} sizes={sizes} />
      ))}
      <img
        src={markup.img.src}
        srcSet={markup.img.srcSet}
        sizes={sizes}
        width={markup.img.width}
        height={markup.img.height}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding={priority ? 'sync' : 'async'}
        className={className}
        style={box}
      />
    </picture>
  );
}

/** The alt text for the page language, falling back to the other language, then to the caller's text. */
export function altFor(image: Pick<ImageSource, 'altBn' | 'altEn'>, lang: 'bn' | 'en', fallback: string): string {
  return (lang === 'bn' ? (image.altBn ?? image.altEn) : (image.altEn ?? image.altBn)) ?? fallback;
}
