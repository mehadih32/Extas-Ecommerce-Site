// PR 290 — an offer e-mail's parts without a database: only the template's own links are clickable (counted while click
// tracking is on), everything else is escaped, the unsubscribe line is always at the foot, the pixel only while open
// tracking is on. Every value is a made-up test value.
import { describe, expect, it } from 'vitest';
import { emailHeaders, emailHtml, emailLinks, emailText, emailUrls } from './email-html';

// hardcode-ok: made-up hosts and ids
const urls = emailUrls('shop.example.com', '0190a0a0-0000-7000-8000-000000000001');
const base = { unsubscribeLine: 'Unsubscribe', urls, lang: 'en' as const };

describe('offer e-mail parts (PR 290)', () => {
  it('the template links: {link} is the home, each once, in order', () => {
    expect(emailLinks('See {link} or https://a.example/x, again {link}', 'https://shop.example.com/')).toEqual(['https://shop.example.com/', 'https://a.example/x']);
    expect(emailLinks('See {link}', null)).toEqual([]);
  });

  it('tracking on: links through the counter, pixel; a link from a name stays text; words escaped', () => {
    const html = emailHtml({ ...base, text: 'Hi <b>http://evil.example</b>\n\nGo https://a.example/x', links: ['https://a.example/x'], trackOpens: true, trackClicks: true });
    expect(html).toContain('Hi &lt;b&gt;http://evil.example&lt;/b&gt;');
    expect(html).not.toContain('href="http://evil.example');
    expect(html).toContain(`<a href="${urls.click(0)}">https://a.example/x</a>`);
    expect(html).toContain(`<img src="${urls.open}"`);
    expect(html).toContain(`<a href="${urls.unsubscribePage}">Unsubscribe</a>`);
  });

  it('tracking off: the links go straight, no pixel; the text part and the headers always carry the unsubscribe', () => {
    const parts = { ...base, text: 'Go https://a.example/x', links: ['https://a.example/x'], trackOpens: false, trackClicks: false };
    const html = emailHtml(parts);
    expect(html).toContain('<a href="https://a.example/x">');
    expect(html).not.toContain('<img');
    expect(emailText(parts)).toBe(`Go https://a.example/x\n\nUnsubscribe: ${urls.unsubscribePage}`);
    expect(emailHeaders(urls)['List-Unsubscribe']).toBe(`<${urls.unsubscribePost}>`);
  });
});
