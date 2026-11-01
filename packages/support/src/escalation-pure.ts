// S22 · PR 538 (Blueprint B4.14 V2 note; §59 answers 48, 49, 54) — the rules without a database: the desk's hours in the
// store's time zone (open now? when does it close or open?), when a waiting customer is due to be reported to the owner
// (the clock runs only while the desk is open, unless the owner wants to hear at any hour), the owner's Telegram line,
// and the link check of a customer's message (which links are risky, and why).
import type { DeskDay, SupportDeskHours, SupportEscalationSettings, SupportLinkSafetySettings } from '@extas/settings';

const MINUTE = 60_000;
const DAY = 86_400_000;
/** Day 0 of JavaScript's week is Sunday. */
const WEEK: readonly DeskDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
/** How far ahead the desk's next opening is looked for (a week and a day: every weekday at least once). */
const AHEAD_DAYS = 8;

interface LocalDay {
  y: number;
  m: number;
  d: number;
}

/** The local calendar day of a moment in a time zone. */
function localDay(at: Date, tz: string): LocalDay {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: n('year'), m: n('month'), d: n('day') };
}

/** How far the time zone is ahead of UTC at a moment, in ms. */
function offsetAt(at: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(at));
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(at / 1000) * 1000;
}

/** The moment a local wall time ("HH:MM", "24:00" = the next midnight) happens on a local day. */
function momentOf(day: LocalDay, hhmm: string, tz: string): number {
  const wall = Date.UTC(day.y, day.m - 1, day.d, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)));
  const first = wall - offsetAt(wall, tz);
  return wall - offsetAt(first, tz);
}

/** The desk's open spells from the day before `from` for AHEAD_DAYS days, in order. */
function spells(from: Date, desk: SupportDeskHours, tz: string): [number, number][] {
  const out: [number, number][] = [];
  const start = localDay(new Date(from.getTime() - DAY), tz);
  for (let i = 0; i <= AHEAD_DAYS; i++) {
    const noon = new Date(Date.UTC(start.y, start.m - 1, start.d + i, 12));
    const day = { y: noon.getUTCFullYear(), m: noon.getUTCMonth() + 1, d: noon.getUTCDate() };
    if (!desk.days.includes(WEEK[noon.getUTCDay()]!)) continue;
    out.push([momentOf(day, desk.opens, tz), momentOf(day, desk.closes, tz)]);
  }
  return out;
}

export interface DeskNow {
  open: boolean;
  /** When it closes (open) or opens next (closed); null when it never opens (no day chosen). */
  next: Date | null;
}

/** The desk now, or null when desk hours are off (always open). */
export function deskNow(at: Date, desk: SupportDeskHours, tz: string): DeskNow | null {
  if (!desk.enabled) return null;
  const t = at.getTime();
  for (const [o, c] of spells(at, desk, tz)) {
    if (t >= o && t < c) return { open: true, next: new Date(c) };
    if (o > t) return { open: false, next: new Date(o) };
  }
  return { open: false, next: null };
}

/**
 * When a customer waiting since `since` is due to be reported: `minutes` later — counting only the desk's open time
 * when desk hours are on and the owner waits for them ('wait'). Null when the desk never opens.
 */
export function escalationDueAt(since: Date, cfg: Pick<SupportEscalationSettings, 'minutes' | 'outsideHours'>, desk: SupportDeskHours, tz: string): Date | null {
  const need = cfg.minutes * MINUTE;
  if (!desk.enabled || cfg.outsideHours === 'tell') return new Date(since.getTime() + need);
  let left = need;
  const t = since.getTime();
  for (const [o, c] of spells(since, desk, tz)) {
    if (c <= t) continue;
    const s = Math.max(o, t);
    if (left <= c - s) return new Date(s + left);
    left -= c - s;
  }
  return null;
}

/** The owner's Telegram line in the chosen language, its blanks filled. */
export function escalationLine(cfg: Pick<SupportEscalationSettings, 'lang' | 'words' | 'showName'>, f: { minutes: number; channel: string; name: string | null; ref: string }): string {
  const name = cfg.showName && f.name?.trim() ? f.name.trim() : '—';
  const fill: Record<string, string> = { minutes: String(f.minutes), channel: f.channel, name, ref: f.ref };
  return cfg.words[cfg.lang].replace(/\{(minutes|channel|name|ref)\}/g, (_, k: string) => fill[k]!);
}

// ---- links in a customer's message ----

export const LINK_REASONS = ['shortener', 'lookalike', 'ending', 'file', 'number', 'punycode', 'login', 'broken'] as const;
export type LinkReason = (typeof LINK_REASONS)[number];

export interface LinkCheck {
  /** The link as written. */
  text: string;
  /** Where it goes (a link written without https:// gets it). */
  url: string;
  /** The site, without "www.". */
  host: string;
  risky: boolean;
  reasons: LinkReason[];
}

/** What is kept on the message (Message.linkSafety). */
export interface MessageLinkSafety {
  checkedAt: string;
  links: LinkCheck[];
}

/** Links: with http(s)://, with www., or a bare site with a path or a known-looking ending ("bit.ly/x", "shop.com"). */
const LINK = /(?:https?:\/\/|www\.)[^\s<>"'`]+|(?<![\p{L}\p{N}@._-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?:\/[^\s<>"'`]*)?(?![\p{L}\p{N}@_-])/giu;
/** A link's end that belongs to the sentence, not the link. */
const TAIL = /[.,;:!?)\]}'"।]+$/u;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
/** A bare site with no path counts as a link only with one of these endings (or a listed one): "ok.thanks" is words. */
const COMMON_ENDINGS = ['com', 'net', 'org', 'info', 'biz', 'bd', 'io', 'co', 'me', 'app', 'shop', 'store', 'online', 'site', 'link', 'live', 'ly', 'gl', 'cc'];

/** The comma- or space-separated list of a setting, lower-case, without dots at the ends. */
export function listOf(s: string): string[] {
  return [...new Set(s.toLowerCase().split(/[\s,]+/).map((x) => x.replace(/^\.+|\.+$/g, '')).filter(Boolean))];
}

const under = (host: string, site: string) => host === site || host.endsWith(`.${site}`);

/** Where the links of a text are (start, end, as written). */
export function findLinks(text: string, cfg?: SupportLinkSafetySettings): { start: number; end: number; text: string }[] {
  const endings = new Set([...COMMON_ENDINGS, ...(cfg ? [...listOf(cfg.riskyEndings), ...[...listOf(cfg.trustedSites), ...listOf(cfg.shorteners)].map((x) => x.split('.').pop()!)] : [])]);
  const out: { start: number; end: number; text: string }[] = [];
  for (const m of text.matchAll(LINK)) {
    const raw = m[0].replace(TAIL, '');
    if (!raw || !/[a-z]/i.test(raw)) continue;
    if (!/^(?:https?:\/\/|www\.)/i.test(raw) && !raw.includes('/') && !endings.has(raw.split('.').pop()!.toLowerCase())) continue;
    out.push({ start: m.index!, end: m.index! + raw.length, text: raw });
  }
  return out;
}

/** One link checked against the lists. A trusted site is never risky. */
export function checkLink(text: string, cfg: SupportLinkSafetySettings): LinkCheck {
  const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { text, url, host: '', risky: true, reasons: ['broken'] };
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  const trusted = listOf(cfg.trustedSites);
  if (trusted.some((t) => under(host, t))) return { text, url: u.href, host, risky: false, reasons: [] };
  const reasons: LinkReason[] = [];
  if (listOf(cfg.shorteners).some((s) => under(host, s))) reasons.push('shortener');
  const looks = trusted.map((t) => t.split('.')[0]!).filter((b) => b.length >= 4);
  if (looks.some((b) => host.includes(b))) reasons.push('lookalike');
  const ending = host.split('.').pop() ?? '';
  if (listOf(cfg.riskyEndings).includes(ending)) reasons.push('ending');
  const file = (u.pathname.split('/').pop() ?? '').toLowerCase();
  const ext = file.includes('.') ? file.split('.').pop()! : '';
  if (ext && listOf(cfg.riskyFiles).includes(ext)) reasons.push('file');
  if (cfg.flagNumbers && (IPV4.test(host) || host.startsWith('['))) reasons.push('number');
  if (host.split('.').some((l) => l.startsWith('xn--'))) reasons.push('punycode');
  if (u.username || u.password) reasons.push('login');
  return { text, url: u.href, host, risky: reasons.length > 0, reasons };
}

/** Every link of a message checked (none when the switch is off or there are no words). */
export function checkMessageLinks(body: string | null, cfg: SupportLinkSafetySettings): LinkCheck[] {
  if (!cfg.enabled || !body) return [];
  return findLinks(body, cfg).map((l) => checkLink(l.text, cfg));
}

export type BodyPart = { text: string; link?: undefined } | { text: string; link: LinkCheck };

/** A message's words cut into plain text and its checked links, in order, for the chat screen. */
export function linkParts(body: string, cfg: SupportLinkSafetySettings): BodyPart[] {
  if (!cfg.enabled) return [{ text: body }];
  const out: BodyPart[] = [];
  let at = 0;
  for (const l of findLinks(body, cfg)) {
    if (l.start > at) out.push({ text: body.slice(at, l.start) });
    out.push({ text: l.text, link: checkLink(l.text, cfg) });
    at = l.end;
  }
  if (at < body.length) out.push({ text: body.slice(at) });
  return out;
}
