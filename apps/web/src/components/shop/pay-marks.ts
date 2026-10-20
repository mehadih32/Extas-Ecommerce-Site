// The payment marks of the footer, drawn by hand exactly as the approved demo draws them (docs/demo/src/03-layout.js
// PAY_LIB): no logo files, no network. Each sits on a tile tinted from the band's colours (the shop stylesheet). The
// brand hexes stay inside the drawings (they are the marks themselves); everything else is the theme's.
import type { PAY_MARKS } from '@extas/settings';

export const PAY_SVG: Record<(typeof PAY_MARKS)[number], string> = {
  bkash: '<text x="32" y="16.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="14" font-weight="800" fill="currentColor">bKash</text>',
  nagad: '<defs><linearGradient id="extas-ngd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFA33C"/><stop offset="1" stop-color="#FF5A4E"/></linearGradient></defs><text x="32" y="16.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="14" font-weight="800" fill="url(#extas-ngd)">Nagad</text>',
  visa: '<text x="32" y="16.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="15" font-weight="800" font-style="italic" letter-spacing="0.6" fill="currentColor">VISA</text>',
  mc: '<circle cx="24" cy="11" r="10.4" fill="#EB001B"/><circle cx="40" cy="11" r="10.4" fill="#F79E1B"/><path d="M32 4.3A10.4 10.4 0 0 1 32 17.7 10.4 10.4 0 0 1 32 4.3Z" fill="#FF5F00"/>',
  cod: '<rect x="3.5" y="5.5" width="19" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="13" cy="11" r="2.8" fill="currentColor"/><text x="44" y="16" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="13" font-weight="800" fill="currentColor">COD</text>',
  rocket: '<text x="32" y="16.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="14" font-weight="800" fill="currentColor">Rocket</text>',
  amex: '<text x="32" y="16.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="13" font-weight="800" letter-spacing="0.5" fill="currentColor">AMEX</text>',
  ssl: '<text x="32" y="15.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="10.5" font-weight="800" fill="currentColor">SSLCOMMERZ</text>',
  upay: '<text x="32" y="16.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="14" font-weight="800" fill="currentColor">upay</text>',
  bank: '<path d="M20 9 32 3l12 6v2H20Z" fill="currentColor"/><path d="M22 12h3v6h-3Zm6 0h3v6h-3Zm6 0h3v6h-3Zm6 0h3v6h-3ZM20 19h24v2H20Z" fill="currentColor"/>',
};
