// PR 741 (owner order 15 Nov 2026, group ঙ) — the look of an offer e-mail (`email.look`, Website › Page settings › E-mail look):
// the shop's logo or name at the top, an optional line under it, the owner's colours and type face, the width, and an
// optional footer line above the unsubscribe line. Off (as shipped) the e-mail stays the plain one (email-html.ts draws it
// without this). Pure: no database; every colour and word is the owner's setting. Table layout and inline styles only,
// because mail apps ignore style sheets. The logo is a picture address on the shop's own domain; without one the shop's
// name is drawn, so the top is never empty.
import type { EmailLook } from '@extas/settings';

export type { EmailLook };

/** What the look needs to draw one e-mail. */
export interface EmailLookView {
  look: EmailLook;
  storeName: string;
  /** The shop's logo as an address on its own domain (null: none; the name is drawn). */
  logoUrl: string | null;
  lang: 'bn' | 'en';
}

const FONT: Record<EmailLook['font'], string> = {
  sans: "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  serif: "Georgia,'Times New Roman',serif",
};

/** The style of a link inside the words (the accent colour). */
export const lookLinkStyle = (v: EmailLookView): string => `color:${v.look.accent};`;

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The whole e-mail: the words (`bodyHtml`) and the unsubscribe line (`footHtml`) inside the owner's look. */
export function wrapWithLook(v: EmailLookView, bodyHtml: string, footHtml: string, pixel: string): string {
  const { look } = v;
  const head = look.header ? (look.header[v.lang] ?? '') : '';
  const top = look.logo && v.logoUrl ? `<img src="${esc(v.logoUrl)}" alt="${esc(v.storeName)}" style="max-width:100%;max-height:72px;height:auto;border:0;display:inline-block">` : `<div style="font-size:22px;font-weight:700;letter-spacing:.02em">${esc(v.storeName)}</div>`;
  const line = head ? `<div style="font-size:13px;margin-top:6px;opacity:.75">${esc(head)}</div>` : '';
  const own = look.footer ? `<div style="margin-bottom:8px">${esc(look.footer[v.lang] ?? '').replace(/\n/g, '<br>')}</div>` : '';
  return (
    `<!doctype html><html lang="${v.lang}"><body style="margin:0;padding:24px 12px;background:${look.background};font-family:${FONT[look.font]};color:${look.text}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">` +
    `<table role="presentation" width="${look.width}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${look.width}px;background:${look.panel};border-radius:8px">` +
    `<tr><td align="center" style="padding:24px;border-bottom:3px solid ${look.accent};color:${look.text}">${top}${line}</td></tr>` +
    `<tr><td style="padding:24px;font-size:15px;line-height:1.6;color:${look.text}">${bodyHtml}</td></tr>` +
    `<tr><td align="center" style="padding:16px 24px;font-size:12px;color:${look.text};opacity:.8">${own}${footHtml}</td></tr>` +
    `</table></td></tr></table>${pixel}</body></html>`
  );
}

/** What the loader needs from the engine (kept small so the engine's own deps fit). */
export interface EmailLookDeps {
  db: {
    mediaAsset: {
      findFirst: (args: unknown) => Promise<{ renditions: { format: string; width: number; storageKey: string }[] } | null>;
    };
  };
  settings: { value: (key: string, at?: { storeId: number }) => Promise<unknown> };
}

/** The widest JPEG of a picture (mail apps do not show AVIF or WebP), as an address on the shop's own media route. */
export async function logoAddress(deps: EmailLookDeps, storeId: number, assetId: string | null, host: string | null): Promise<string | null> {
  if (!assetId || !host) return null;
  const a = await deps.db.mediaAsset.findFirst({ where: { id: assetId, storeId, archivedAt: null, kind: 'IMAGE' }, select: { renditions: { select: { format: true, width: true, storageKey: true } } } });
  const best = [...(a?.renditions ?? []).filter((r) => r.format === 'jpeg')].sort((x, y) => y.width - x.width)[0];
  if (!best) return null;
  return `https://${host}/media/${best.storageKey.split('/').map(encodeURIComponent).join('/')}`;
}

/** The look for one store's e-mails, or null while it is off (the plain e-mail). */
export async function loadEmailLook(deps: EmailLookDeps, storeId: number, ctx: { storeName: string; host: string | null; lang: 'bn' | 'en' }): Promise<EmailLookView | null> {
  const look = (await deps.settings.value('email.look', { storeId })) as EmailLook;
  if (!look.on) return null;
  const logo = look.logo ? ((await deps.settings.value('brand.logo', { storeId })) as string | null) : null;
  return { look, storeName: ctx.storeName, logoUrl: await logoAddress(deps, storeId, logo, ctx.host), lang: ctx.lang };
}
