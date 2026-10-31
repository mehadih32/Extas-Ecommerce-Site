// Go-live gate F-041 / F-054 (follow-ups of PR 172, 171) — the words of the refund and wallet screens
// (messages/admin-refunds.<lang>.json, everything under `moneyRefunds.*`), for Money › Refunds & wallet and a customer's
// Wallet tab, and the same words as flat `a.b` keys for their client buttons (no function crosses from the server).
import type { Words } from '@/components/admin/money/RefundActions';
import type { Dict } from '@/lib/i18n';
import bn from '../../messages/admin-refunds.bn.json';
import en from '../../messages/admin-refunds.en.json';

/** The `moneyRefunds` words of one language. */
export const refundWords = (lang: 'bn' | 'en'): Dict => (lang === 'bn' ? bn : en).moneyRefunds as unknown as Dict;

/** A nested words object as flat `a.b` keys, for a client component. */
export function flatWords(d: unknown, prefix = ''): Words {
  if (!d || typeof d !== 'object') return {};
  const out: Words = {};
  for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
    if (typeof v === 'string') out[`${prefix}${k}`] = v;
    else Object.assign(out, flatWords(v, `${prefix}${k}.`));
  }
  return out;
}
