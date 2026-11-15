// PR 741 — the e-mail look screen's picture: a sample offer e-mail drawn through the very same code the sent e-mails use
// (packages/messages email-html + email-look), with the saved look, whether it is switched on yet or not (so the owner sees
// what "on" will look like). The words are the screen's own sample; the logo is the shop's own, on this host's media route.
// Nothing is sent and nothing is written.
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { emailHtml, emailUrls, logoAddress, type EmailLook } from '@extas/messages';
import type { AppResolver } from '../settings';

export async function emailPreview(deps: { db: PrismaClient; resolver: AppResolver }, look: EmailLook, o: { lang: 'bn' | 'en'; host: string | null; text: string; unsubscribe: string }): Promise<string> {
  const at = { storeId: MOTHER_STORE_ID };
  const [name, logo] = await Promise.all([deps.resolver.value('store.name', at) as Promise<string>, look.logo ? (deps.resolver.value('brand.logo', at) as Promise<string | null>) : Promise.resolve(null)]);
  const logoUrl = await logoAddress({ db: deps.db as never, settings: deps.resolver as never }, MOTHER_STORE_ID, logo, o.host).catch(() => null);
  const urls = emailUrls(o.host ?? 'shop.invalid', 'preview'); // hardcode-ok: a sample address for the preview only; the preview never counts an open or a click
  return emailHtml({ text: o.text, links: [], unsubscribeLine: o.unsubscribe, urls, trackOpens: false, trackClicks: false, lang: o.lang, look: { look, storeName: name, logoUrl, lang: o.lang } });
}
