// PR 75 follow-up (go-live gate customer 360°, 1 Nov) — POST /api/shop/contact on a real PostgreSQL (the checkout's own
// throwaway database; skipped without TEST_DATABASE_ADMIN_URL), called the way the contact page calls it: same-site
// only, the number as he typed it (Bengali digits too), one id per filled-in form. Off as shipped and too many today are
// calm answers (200, `ok: false`); a cross-site post is refused. Made-up numbers and words.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { setUpCheckout, type CheckoutFixture } from '@extas/checkout/testing';
import { registry } from '@extas/settings';
import type { CheckoutApiDeps } from './checkout-api';
import { contactHandler } from './contact-api';

const ORIGIN = 'https://shop.example.test';

describe.skipIf(!HAS_TEST_DB)('the contact page form API on PostgreSQL (PR 75 follow-up)', () => {
  let f: CheckoutFixture;
  const deps = (): CheckoutApiDeps => ({ checkout: f.deps(), storeId: f.S });
  const req = (b: unknown, site = 'same-origin') =>
    new Request(`${ORIGIN}/api/shop/contact`, { method: 'POST', headers: { 'sec-fetch-site': site, 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> });
  const FORM = { name: 'Sample Customer', phone: '০১৭০০-০০০১৭৫', orderNumber: '', text: 'Do you have the shirt in XL?', lang: 'en' };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    f = await setUpCheckout('contact_api');
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await f?.t.drop();
  });

  it('is off as shipped: a calm answer and nothing in the inbox', async () => {
    expect(await read(await contactHandler(req({ ...FORM, requestKey: 'form-api-0001' }), deps()))).toEqual({ status: 200, body: { ok: false, error: 'CONTACT_FORM_OFF' } });
    expect(await f.t.prisma.conversation.count({ where: { storeId: f.S, channel: { kind: 'contactform' } } })).toBe(0);
  });

  it('switched on: the message lands from his cleaned number; the same form twice is one message; a bad number or an empty message is refused', async () => {
    f.overrides.set('pages.contactForm', { ...registry['pages.contactForm'].default, enabled: true, perPhonePerDay: 2 });
    const a = await read(await contactHandler(req({ ...FORM, requestKey: 'form-api-0002' }), deps()));
    expect(a).toEqual({ status: 200, body: { ok: true, duplicate: false } });
    expect((await read(await contactHandler(req({ ...FORM, requestKey: 'form-api-0002' }), deps()))).body).toEqual({ ok: true, duplicate: true });
    const conv = await f.t.prisma.conversation.findFirstOrThrow({ where: { storeId: f.S, channel: { kind: 'contactform' } }, include: { contact: true, messages: true } });
    expect(conv.contact.phone).toBe('+8801700000175');
    expect(conv.messages.map((m) => m.body)).toEqual(['Do you have the shirt in XL?']);
    expect((await read(await contactHandler(req({ ...FORM, phone: '0123', requestKey: 'form-api-0003' }), deps()))).status).toBe(400);
    expect((await read(await contactHandler(req({ ...FORM, text: '  ', requestKey: 'form-api-0004' }), deps()))).body).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['text'] });
    await contactHandler(req({ ...FORM, requestKey: 'form-api-0005' }), deps());
    expect(await read(await contactHandler(req({ ...FORM, requestKey: 'form-api-0006' }), deps()))).toEqual({ status: 200, body: { ok: false, error: 'TOO_MANY', perDay: 2 } });
  });

  it('only from the shop itself, and only POST', async () => {
    expect((await contactHandler(req({ ...FORM, requestKey: 'form-api-0007' }, 'cross-site'), deps())).status).toBe(403);
    expect((await contactHandler(new Request(`${ORIGIN}/api/shop/contact`), deps())).status).toBe(405);
    expect((await contactHandler(req({ ...FORM, requestKey: 'form-api-0008' }), null)).status).toBe(503);
  });
});
