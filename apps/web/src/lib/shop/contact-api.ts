// PR 75 follow-up (go-live gate customer 360°, 1 Nov) — POST /api/shop/contact: the contact page's "Send us a message"
// form. The number is read by the one shared cleaner (lib/phone-bd); the message lands in the Support inbox from his
// number (@extas/support sendContactForm), linked to the order he names when it is his. Switched off (`pages.contactForm`,
// off as shipped) or a number that sent its messages for today are calm states of the shop (200 with `ok: false`, as the
// checkout's "Call me"), never failed requests. Nothing is sent to him and nothing changes an order.
import { isSupportError, sendContactForm } from '@extas/support';
import { body, fail, json } from '../admin-auth';
import { phoneNormalizeBD } from '../phone-bd';
import { guard, langOf, refusal, type CheckoutApiDeps } from './checkout-api';

/** The refusals the page answers calmly (a notice, not an error). */
export const CONTACT_CALM = ['CONTACT_FORM_OFF', 'TOO_MANY'] as const;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export async function contactHandler(request: Request, deps: CheckoutApiDeps | null): Promise<Response> {
  const stop = guard(request, deps, ['POST']);
  if (stop || !deps) return stop!;
  try {
    const b = (await body(request)) as Record<string, unknown>;
    const phone = phoneNormalizeBD(str(b.phone));
    if (!phone.ok) return fail(400, 'INVALID_INPUT', ['phone']);
    const text = str(b.text).trim();
    if (!text) return fail(400, 'INVALID_INPUT', ['text']);
    const name = str(b.name).trim().slice(0, 120);
    const orderNumber = str(b.orderNumber).trim().toUpperCase().slice(0, 40);
    const r = await sendContactForm(
      { db: deps.checkout.db, settings: deps.checkout.settings },
      { storeId: deps.storeId, phone: phone.e164, ...(name ? { name } : {}), ...(orderNumber ? { orderNumber } : {}), text, requestKey: str(b.requestKey), lang: langOf(b.lang) },
    );
    return json({ ok: true, duplicate: r.duplicate });
  } catch (e) {
    if (isSupportError(e)) {
      const calm = (CONTACT_CALM as readonly string[]).includes(e.code);
      return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}), ...(e.data ?? {}) }, { status: calm ? 200 : e.status });
    }
    return refusal(e);
  }
}
