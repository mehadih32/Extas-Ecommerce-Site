// S11 · PR 233 — the Search Console and Bing verification codes (`seo.verification`): what the owner pastes turned into
// the code, the meta tags every shop page carries, and which of the engine's properties is the shop. Pure and
// browser-safe (the admin card uses `verificationCode` as the owner pastes; the server checks each code again).

/** The meta tag names the engines read ("HTML tag" verification). */
export const VERIFICATION_META = { google: 'google-site-verification', bing: 'msvalidate.01' } as const;
export type Engine = keyof typeof VERIFICATION_META;

/**
 * The code in what the owner pasted: the engine shows a whole tag (`<meta name="…" content="CODE" />`), so the code is
 * taken from `content`; a bare code is kept as it is (trimmed).
 */
export function verificationCode(pasted: string): string {
  const m = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(pasted);
  return (m ? m[1]! : pasted).trim();
}

/** One code per line, blanks dropped, each pasted line turned into its code. */
export const verificationLines = (text: string): string[] => text.split(/\r?\n/).map(verificationCode).filter(Boolean);

/** Next.js `metadata.verification` for the shop's pages, or undefined while no code is set. */
export function verificationMetadata(v: { google: readonly string[]; bing: readonly string[] }): { google?: string[]; other?: Record<string, string[]> } | undefined {
  if (!v.google.length && !v.bing.length) return undefined;
  return { ...(v.google.length ? { google: [...v.google] } : {}), ...(v.bing.length ? { other: { [VERIFICATION_META.bing]: [...v.bing] } } : {}) };
}

/** The meta tags as a page carries them (the admin card shows them). */
export function verificationTags(v: { google: readonly string[]; bing: readonly string[] }): string[] {
  return (['google', 'bing'] as const).flatMap((e) => v[e].map((code) => `<meta name="${VERIFICATION_META[e]}" content="${code}" />`));
}

/**
 * The engine's property that is the shop, for an address like `https://shop.example/`: the same address (with or
 * without its last `/`), else the whole domain (`sc-domain:shop.example`, Google), else null.
 */
export function propertyFor(sites: readonly string[], origin: URL): string | null {
  const same = (s: string) => s.replace(/\/+$/, '').toLowerCase() === origin.origin.toLowerCase();
  const domain = `sc-domain:${origin.hostname.toLowerCase().replace(/^www\./, '')}`;
  return sites.find(same) ?? sites.find((s) => s.toLowerCase() === domain) ?? null;
}
