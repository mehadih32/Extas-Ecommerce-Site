// PR 538 — desk hours in the shop's time zone, when a waiting customer is due to be reported, the owner's line, and the
// link check of a customer's message (Banglish and Bengali text around the links).
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { checkLink, checkMessageLinks, deskNow, escalationDueAt, escalationLine, findLinks, linkParts } from './escalation-pure';

const TZ = 'Asia/Dhaka'; // UTC+6, no summer time
const desk = { ...registry['support.deskHours'].default, enabled: true };
const esc = registry['support.escalation'].default;
const links = { ...registry['support.linkSafety'].default, enabled: true, trustedSites: 'extas.com.bd, www.extas.com.bd' };
const dhaka = (s: string) => new Date(`${s}+06:00`);

describe('desk hours (10:00–22:00 Dhaka)', () => {
  it('open now and when it closes; closed and when it opens; off = no desk', () => {
    expect(deskNow(dhaka('2026-11-01T12:00:00'), desk, TZ)).toEqual({ open: true, next: dhaka('2026-11-01T22:00:00') });
    expect(deskNow(dhaka('2026-11-01T23:30:00'), desk, TZ)).toEqual({ open: false, next: dhaka('2026-11-02T10:00:00') });
    expect(deskNow(dhaka('2026-11-01T03:00:00'), desk, TZ)).toEqual({ open: false, next: dhaka('2026-11-01T10:00:00') });
    expect(deskNow(dhaka('2026-11-01T12:00:00'), { ...desk, enabled: false }, TZ)).toBeNull();
    expect(deskNow(dhaka('2026-11-01T12:00:00'), { ...desk, days: [] }, TZ)).toEqual({ open: false, next: null });
  });

  it('a closed Friday is skipped (1 Nov 2026 is a Sunday; Fri 6 Nov closed → Sat 7 Nov 10:00)', () => {
    const noFri = { ...desk, days: desk.days.filter((d) => d !== 'fri') };
    expect(deskNow(dhaka('2026-11-05T22:30:00'), noFri, TZ)).toEqual({ open: false, next: dhaka('2026-11-07T10:00:00') });
  });

  it('works in a time zone with summer time (London, the clocks went back on 25 Oct)', () => {
    const at = new Date('2026-11-02T10:30:00Z'); // 10:30 in London (GMT)
    expect(deskNow(at, desk, 'Europe/London')).toEqual({ open: true, next: new Date('2026-11-02T22:00:00Z') });
  });
});

describe('when a waiting customer is reported', () => {
  it('desk hours off or "tell at any hour": the minutes straight on', () => {
    const at = dhaka('2026-11-01T23:00:00');
    expect(escalationDueAt(at, esc, { ...desk, enabled: false }, TZ)).toEqual(dhaka('2026-11-01T23:05:00'));
    expect(escalationDueAt(at, { ...esc, outsideHours: 'tell' }, desk, TZ)).toEqual(dhaka('2026-11-01T23:05:00'));
  });

  it('"wait": only open minutes count — at night it is due 5 min after opening; 2 min before closing → 3 min after opening', () => {
    expect(escalationDueAt(dhaka('2026-11-01T23:00:00'), esc, desk, TZ)).toEqual(dhaka('2026-11-02T10:05:00'));
    expect(escalationDueAt(dhaka('2026-11-01T21:58:00'), esc, desk, TZ)).toEqual(dhaka('2026-11-02T10:03:00'));
    expect(escalationDueAt(dhaka('2026-11-01T12:00:00'), esc, desk, TZ)).toEqual(dhaka('2026-11-01T12:05:00'));
    expect(escalationDueAt(dhaka('2026-11-01T12:00:00'), esc, { ...desk, days: [] }, TZ)).toBeNull();
  });

  it('the line: its blanks filled; the name only when asked', () => {
    const f = { minutes: 7, channel: 'WhatsApp', name: 'Rahim', ref: 'CS22WA0001' };
    expect(escalationLine({ ...esc, lang: 'en' }, f)).toBe('A customer has waited 7 min with no answer — WhatsApp · Rahim · chat CS22WA0001');
    expect(escalationLine(esc, f)).toContain('7 মিনিট');
    expect(escalationLine({ ...esc, lang: 'en', showName: false }, f)).toContain('WhatsApp · — · chat');
    expect(escalationLine({ ...esc, lang: 'en' }, { ...f, name: '  ' })).toContain('· — ·');
  });
});

describe('links in a customer message', () => {
  it('finds links with and without https, not words with a dot, not the sentence end', () => {
    const t = 'Bhai ei link e dekhen: https://bit.ly/3xYz. ar www.extas.com.bd/p/polo, ba extas-offer.top/win! ok.thanks M.size 2.5';
    expect(findLinks(t, links).map((l) => l.text)).toEqual(['https://bit.ly/3xYz', 'www.extas.com.bd/p/polo', 'extas-offer.top/win']);
    expect(findLinks('অর্ডার করতে চাই। দাম কত? extas.com.bd।', links).map((l) => l.text)).toEqual(['extas.com.bd']);
    expect(findLinks('mail me: a@b.com', links)).toEqual([]);
  });

  it('a trusted site is safe; shortener, look-alike, odd ending, installer, number address, punycode, login trick are risky', () => {
    expect(checkLink('https://www.extas.com.bd/p/polo', links)).toMatchObject({ risky: false, reasons: [], host: 'extas.com.bd' });
    expect(checkLink('https://www.daraz.com.bd/x', links)).toMatchObject({ risky: false });
    expect(checkLink('bit.ly/3xYz', links)).toMatchObject({ risky: true, reasons: ['shortener'], url: 'https://bit.ly/3xYz' });
    expect(checkLink('extas-offer.top/win', links).reasons).toEqual(['lookalike', 'ending']);
    expect(checkLink('https://cdn.example.com/files/bkash-update.apk', links).reasons).toEqual(['file']);
    expect(checkLink('http://192.168.10.5/login', links).reasons).toEqual(['number']);
    expect(checkLink('https://xn--extas-9ta.com/', links).reasons).toContain('punycode');
    expect(checkLink('https://extas.com.bd@evil.example.com/', links)).toMatchObject({ host: 'evil.example.com', reasons: ['login'] });
    expect(checkLink('http://192.168.10.5/', { ...links, flagNumbers: false }).risky).toBe(false);
  });

  it('switch off: nothing checked, the words stay one piece', () => {
    const off = { ...links, enabled: false };
    expect(checkMessageLinks('bit.ly/x', off)).toEqual([]);
    expect(linkParts('see bit.ly/x now', off)).toEqual([{ text: 'see bit.ly/x now' }]);
  });

  it('the chat screen gets the words cut around each checked link', () => {
    const parts = linkParts('see bit.ly/x and extas.com.bd now', links);
    expect(parts.map((p) => [p.text, p.link?.risky ?? null])).toEqual([['see ', null], ['bit.ly/x', true], [' and ', null], ['extas.com.bd', false], [' now', null]]);
  });
});
