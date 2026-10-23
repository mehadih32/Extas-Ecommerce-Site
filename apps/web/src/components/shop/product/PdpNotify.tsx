'use client';
// SIM-F-035 (PR 56, with PR 36's request) — "tell me when it is back" for a size crossed out in the chosen colour, or
// for a product off sale: the shopper leaves a mobile number and the request lands in the admin's back-in-stock list
// (`/api/back-in-stock`, PR 36). Off by default (`pdp.size.notifyBack`): the message that answers it is sent once the
// back-in-stock alerts exist, and the words promise only that the shop will tell him.
// PR 71: the form itself is the shared NotifyForm (the wishlist's sold-out items use it too); this gives it the
// product page's words and product. The request is judged on the sellable stock the page shows (follow-up 63).
import { NotifyForm, type NotifyWords } from '../NotifyForm';
import { usePdp } from './PdpRoot';

const KEYS = ['title', 'placeholder', 'button', 'close', 'done', 'error', 'empty', 'short', 'prefix'] as const;

export function PdpNotify({ variantId, what, onClose }: { variantId: string | null; what: string; onClose?: () => void }) {
  const { m, w } = usePdp();
  // the title's {what} and the answer's {number} slots stay for the form to fill
  const words = Object.fromEntries(KEYS.map((k) => [k, w(`notify.${k}`)])) as NotifyWords;
  return <NotifyForm productId={m.productId} variantId={variantId} what={what} words={words} onClose={onClose} />;
}
