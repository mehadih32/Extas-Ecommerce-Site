// S16 · PR 350 — a VAT rate as the owner types it and as the page shows it (shared by the server and the Money → VAT
// screen, so the browser never needs the server's modules). Rates are kept in basis points: 1500 = 15 %.

/** A percentage typed as text ("15", "7.5", "১৫", "7,5") as basis points 0–5,000 (0–50 %, at most 2 decimals), or null. */
export function percentToBps(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const s = [...String(raw).trim().replace('%', '').trim().replace(',', '.')].map((c) => ('০১২৩৪৫৬৭৮৯'.includes(c) ? String('০১২৩৪৫৬৭৮৯'.indexOf(c)) : c)).join('');
  const m = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
  return bps <= 5_000 ? bps : null;
}

/** Basis points as a percentage for a field ("15", "7.5", "0"). */
export const bpsToPercent = (bps: number) => String(bps / 100);
