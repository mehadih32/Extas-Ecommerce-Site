// S14 · PR 290 — an offer e-mail as it goes (no database): the rendered words as plain text and as simple HTML, the
// unsubscribe line with its link at the foot of both (always; CN-021 P14), and — while the owner's tracking switches are
// on — each of the template's own links through the shop's click counter and a one-pixel image for the open. Only the
// links written in the template (with `{link}`, the shop's home) are made clickable and counted: a link inside a
// customer's name stays plain text, and the click counter only ever sends a person to one of the template's links (never
// an open redirect). Every word is the owner's: the template and the unsubscribe line are settings.

/** A link in an e-mail's words. */
export const EMAIL_URL = /https?:\/\/[^\s<>"'`)\]]+/g;

/** Each link in a text with where it starts (a full stop or comma right after a link is not part of it). */
export function urlsIn(text: string): { url: string; at: number }[] {
  return [...text.matchAll(EMAIL_URL)].map((m) => ({ url: m[0].replace(/[.,;:!?]+$/, ''), at: m.index }));
}

/** The template's own links, in order and once each, with `{link}` as the shop's home (null: no shop address yet). */
export function emailLinks(body: string, home: string | null): string[] {
  const text = home ? body.replaceAll('{link}', home) : body;
  const out: string[] = [];
  for (const m of urlsIn(text)) if (!out.includes(m.url)) out.push(m.url);
  return out;
}

/** The shop's addresses for one e-mail (its log row's id): open pixel, click counter, unsubscribe page and one-click. */
export interface EmailUrls {
  open: string;
  click: (n: number) => string;
  unsubscribePage: string;
  unsubscribePost: string;
}

export function emailUrls(host: string, logId: string): EmailUrls {
  const root = `https://${host}`;
  const id = encodeURIComponent(logId);
  return {
    open: `${root}/api/email/open/${id}`,
    click: (n) => `${root}/api/email/click/${id}/${n}`,
    unsubscribePage: `${root}/email/unsubscribe/${id}`,
    unsubscribePost: `${root}/api/email/unsubscribe/${id}`,
  };
}

export interface EmailParts {
  /** The rendered words (the template filled for this person). */
  text: string;
  /** The template's own links (`emailLinks`): only these are made clickable. */
  links: readonly string[];
  /** The owner's unsubscribe line in the e-mail's language. */
  unsubscribeLine: string;
  urls: EmailUrls;
  trackOpens: boolean;
  trackClicks: boolean;
  lang: 'bn' | 'en';
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]!);

/** One paragraph's HTML: plain text escaped, the template's links as links (counted while click tracking is on). */
function paragraphHtml(p: string, parts: EmailParts): string {
  let out = '';
  let at = 0;
  for (const m of urlsIn(p)) {
    const n = parts.links.indexOf(m.url);
    out += escapeHtml(p.slice(at, m.at));
    out += n < 0 ? escapeHtml(m.url) : `<a href="${escapeHtml(parts.trackClicks ? parts.urls.click(n) : m.url)}">${escapeHtml(m.url)}</a>`;
    at = m.at + m.url.length;
  }
  return out + escapeHtml(p.slice(at)).replace(/\n/g, '<br>');
}

/** The e-mail's HTML: its paragraphs, then the unsubscribe line as a link, then the open pixel while that is on. */
export function emailHtml(parts: EmailParts): string {
  const body = parts.text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${paragraphHtml(p.trim(), parts)}</p>`)
    .join('');
  const foot = `<p style="font-size:12px;color:#666"><a href="${escapeHtml(parts.urls.unsubscribePage)}">${escapeHtml(parts.unsubscribeLine)}</a></p>`;
  const pixel = parts.trackOpens ? `<img src="${escapeHtml(parts.urls.open)}" width="1" height="1" alt="">` : '';
  return `<!doctype html><html lang="${parts.lang}"><body>${body}${foot}${pixel}</body></html>`;
}

/** The plain-text part: the words, then the unsubscribe line with its address. */
export function emailText(parts: EmailParts): string {
  return `${parts.text.trim()}\n\n${parts.unsubscribeLine}: ${parts.urls.unsubscribePage}`;
}

/** The headers every offer e-mail carries: one-click unsubscribe (RFC 8058) for the reader's mail app. */
export function emailHeaders(urls: EmailUrls): Record<string, string> {
  return { 'List-Unsubscribe': `<${urls.unsubscribePost}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}
