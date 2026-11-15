// PR 781 — Settings › Store details as prototype v5 draws it (m-settings.js `renderStore`): cards titled Business & legal,
// Addresses, Contact, Logo set & brand colours, Social links, Invoice & sticker, Tax & VAT (Numbers, money & language and
// Targets are not built yet). The legal numbers are edited on this page; every other card's values already live where the
// shop uses them, so each card here opens that page instead of keeping a second copy (nothing moves, no address changes).
// A card shows only to a person who may open its page. Words: messages/admin-store.<lang>.json `stp.where.*`. Pure.
import { cardTarget } from '@/lib/admin-website-control/cards';
import type { ShellViewer } from '@/lib/admin-shell/sections';

export const STORE_WHERE: readonly { id: string; nav: string }[] = [
  { id: 'addresses', nav: 'websiteBrand' },
  { id: 'contact', nav: 'websiteBrand' },
  { id: 'logos', nav: 'websiteBrand' },
  { id: 'social', nav: 'websiteBrand' },
  { id: 'invoice', nav: 'packingInvoices' },
  { id: 'tax', nav: 'moneyVat' },
];

export function storeWhere(viewer: ShellViewer): { id: string; href: string }[] {
  return STORE_WHERE.flatMap((c) => {
    const to = cardTarget(c);
    return to && (viewer.owner || viewer.perms.has(to.perm)) ? [{ id: c.id, href: to.href }] : [];
  });
}
