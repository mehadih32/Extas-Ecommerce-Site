// The shop's icons (PR 40): line icons, the WhatsApp mark, the garment icons and the payment marks — all inline SVG,
// drawn as the demo draws them, so nothing is fetched and every icon takes the text colour.
import type { ShopIcon } from '@extas/settings';
import { GARMENT_PATHS, ICON_PATHS } from './icon-paths';
import { PAY_SVG } from './pay-marks';

export function Icon({ name, size = 20, stroke = 1.7, className }: { name: ShopIcon; size?: number; stroke?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}

const WA_BUBBLE =
  'M16.04 3.2c-7.08 0-12.83 5.74-12.83 12.82 0 2.26.59 4.47 1.72 6.42L3.1 29.1l6.84-1.79a12.8 12.8 0 006.1 1.55h.01c7.07 0 12.82-5.75 12.82-12.83 0-3.43-1.33-6.65-3.75-9.07a12.74 12.74 0 00-9.08-3.76zm0 23.5h-.01a10.65 10.65 0 01-5.43-1.49l-.39-.23-4.06 1.06 1.09-3.96-.26-.4a10.62 10.62 0 01-1.63-5.66c0-5.88 4.79-10.66 10.68-10.66 2.85 0 5.53 1.11 7.54 3.13a10.59 10.59 0 013.12 7.54c0 5.89-4.79 10.67-10.65 10.67z';
const WA_HANDSET =
  'M21.88 18.9c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.71.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.89-1.78-2.21-.18-.32-.02-.5.14-.66.15-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.71-1.73-.98-2.36-.26-.62-.52-.54-.71-.55l-.61-.01c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65 0 1.57 1.14 3.08 1.3 3.29.16.21 2.25 3.43 5.45 4.81.76.33 1.35.52 1.82.67.76.24 1.46.21 2.01.13.61-.09 1.89-.77 2.16-1.52.27-.74.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37z';

/** The real WhatsApp mark (a filled bubble with the handset knocked out), as every WhatsApp button uses it. */
export function WaGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg className="wa-glyph" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path fill="currentColor" d={WA_BUBBLE} />
      <path fill="currentColor" d={WA_HANDSET} />
    </svg>
  );
}

/** V12.2 (Note 54 #2, 98c-n54.js N54_SOC): each network's own filled mark, 24 × 24, in the text colour. */
const SOCIAL_MARKS = {
  facebook: 'M13.6 21.5v-8.2h2.8l.4-3.3h-3.2V7.9c0-.9.3-1.6 1.6-1.6h1.7V3.4a22 22 0 0 0-2.5-.1c-2.5 0-4.2 1.5-4.2 4.3V10H7.5v3.3h2.7v8.2Z',
  instagram:
    'M12 3.2c2.4 0 2.7 0 3.6.1 2.4.1 3.5 1.2 3.6 3.6.1.9.1 1.2.1 3.6v3c0 2.4 0 2.7-.1 3.6-.1 2.4-1.2 3.5-3.6 3.6-.9.1-1.2.1-3.6.1h-3c-2.4 0-2.7 0-3.6-.1-2.4-.1-3.5-1.2-3.6-3.6-.1-.9-.1-1.2-.1-3.6v-3c0-2.4 0-2.7.1-3.6.1-2.4 1.2-3.5 3.6-3.6.9-.1 1.2-.1 3.6-.1Zm0 4.4a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Zm0 1.7a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4Zm4.6-2.9a1.05 1.05 0 1 0 0 2.1 1.05 1.05 0 0 0 0-2.1Z',
  youtube:
    'M21.6 7.3a2.6 2.6 0 0 0-1.8-1.9C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.6 2.6 0 0 0-1.8 1.9A27 27 0 0 0 2 12a27 27 0 0 0 .4 4.7 2.6 2.6 0 0 0 1.8 1.9C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.9A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.7ZM10 15.1V8.9l5.3 3.1Z',
  tiktok: 'M16.4 2.5h-3.2v12.9a2.8 2.8 0 1 1-2.8-2.8c.3 0 .6 0 .8.1V9.4a6.1 6.1 0 1 0 5.2 6V8.8a7.8 7.8 0 0 0 4.3 1.3V6.9a4.4 4.4 0 0 1-4.3-4.4Z',
} as const;
const EVEN_ODD = new Set(['instagram', 'youtube']);

/** A social network's mark; WhatsApp is the WhatsApp glyph. */
export function SocialMark({ id, size }: { id: keyof typeof SOCIAL_MARKS | 'whatsapp'; size: number }) {
  if (id === 'whatsapp') return <WaGlyph size={size} />;
  return (
    <svg className="soc-g" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={SOCIAL_MARKS[id]} fillRule={EVEN_ODD.has(id) ? 'evenodd' : undefined} />
    </svg>
  );
}

/** A category's icon, from its garment type; an unknown garment still gets a sane icon. */
export function GarmentIcon({ garment, size = 15 }: { garment: string | null; size?: number }) {
  const p = garment ? GARMENT_PATHS[garment] : undefined;
  if (!p) return <Icon name="grid" size={size} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: p }}
    />
  );
}

/** One payment mark on its tile. `idSuffix` keeps the gradient id unique when the row is drawn twice (desktop footer). */
/** H13 · the reference desktop footer's white badges sit in a tighter frame than the 64 × 22 tile, so five fit a row. */
const BADGE_BOX: Partial<Record<keyof typeof PAY_SVG, string>> = { cod: '2 0 60 22', ssl: '0 0 64 22' };

export function PayMark({ id, label, idSuffix = '', badge = false }: { id: keyof typeof PAY_SVG; label: string; idSuffix?: string; badge?: boolean }) {
  const svg = idSuffix ? PAY_SVG[id].replace(/extas-ngd/g, `extas-ngd${idSuffix}`) : PAY_SVG[id];
  return (
    <span className={`${badge ? 'fdr-pm' : 'ftr-pay-t'} pm-${id}`} title={badge ? label : undefined}>
      <svg
        viewBox={badge ? (BADGE_BOX[id] ?? '7 0 50 22') : '0 0 64 22'}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={label}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </span>
  );
}
