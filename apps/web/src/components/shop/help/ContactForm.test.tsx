// PR 75 follow-up (go-live gate customer 360°, 1 Nov) — the contact page's form draws the demo's fields (pg_contact)
// with labels tied to their boxes, the shop's longest message on the box, and both languages have every word (its
// own, and the phone words every phone box shares).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { contactFormWords } from '@/lib/shop/contact-form-words';
import { shopT } from '@/lib/shop/dict';
import { ContactForm } from './ContactForm';

const words = (lang: 'en' | 'bn') => contactFormWords(shopT(lang));

describe('the contact page form (PR 75 follow-up)', () => {
  it('has every word in English and Bengali', () => {
    for (const lang of ['en', 'bn'] as const) {
      for (const [k, v] of Object.entries(words(lang))) expect(v, `${lang} ${k}`).not.toMatch(/^(helpPage|account|pdp)\./);
      expect(words(lang).done).toContain('{number}');
      expect(words(lang).tooLong).toContain('{max}');
    }
  });

  it('draws name, phone, order number and the message, each with its label, and the send button', () => {
    const html = renderToStaticMarkup(<ContactForm words={words('en')} lang="en" maxChars={600} />);
    for (const id of ['ct-name', 'ct-phone', 'ct-order', 'ct-msg']) expect(html).toContain(`for="${id}"`);
    expect(html).toContain('type="tel"');
    expect(html).toContain('maxLength="600"');
    expect(html).toContain('Send message');
    expect(html).toContain('We reply on WhatsApp or by phone.');
    expect(renderToStaticMarkup(<ContactForm words={words('bn')} lang="bn" maxChars={600} />)).toContain('মেসেজ পাঠান');
  });
});
