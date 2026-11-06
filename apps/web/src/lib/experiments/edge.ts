// S02 · PR 83 — what the proxy needs for A/B tests, with no database and no heavy imports: the request headers it hands
// a shop page (a new visitor's random id, a preview of one test's version), the preview address, the bots that are never
// counted, and a new random visitor id in the bag cookie's own format (@extas/cart `visitorIdSchema`).

/** The random id the proxy gave a visitor who had none (this request only; the cookie comes back with the answer). */
export const AB_VISITOR_HEADER = 'x-extas-ab-visitor';
/** A preview of one test's version (`<test id>.a` or `<test id>.b`), from the address's `abPreview`. */
export const AB_PREVIEW_HEADER = 'x-extas-ab-preview';
export const AB_PREVIEW_PARAM = 'abPreview';
/** The preview kept while the person moves from page to page (until the browser closes, or `?abPreview=off`). */
export const AB_PREVIEW_COOKIE = 'extas_ab_preview';
/** The session cookie that keeps a preview (or clears it with `off`). */
export const previewCookie = (value: string | null): string =>
  value ? `${AB_PREVIEW_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax` : `${AB_PREVIEW_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
const PREVIEW = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(a|b)$/;

/** A preview value from the address, or null. */
export function previewOf(raw: string | null | undefined): { id: string; version: 'a' | 'b' } | null {
  const m = raw ? PREVIEW.exec(raw) : null;
  return m ? { id: m[1]!, version: m[2] as 'a' | 'b' } : null;
}

/** Bots and page checkers are never counted and always see the shop as it is. */
export const BOT = /bot|crawl|spider|slurp|preview|lighthouse|headless|facebookexternalhit|whatsapp|curl|wget|python|monitor/i;

/** The bag cookie's visitor id format (the same rule as @extas/cart `visitorIdSchema`). */
const VISITOR = /^[A-Za-z0-9_-]{16,80}$/;
export const visitorIdOf = (raw: string | null | undefined): string | null => (raw && VISITOR.test(raw) ? raw : null);

/** A new random visitor id: 24 random bytes, base64url (32 characters), like the bag's own. */
export function newVisitorId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
