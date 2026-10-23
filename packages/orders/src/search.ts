// PR 154 — how the admin finds an order (§5.3 ORD-01 search, the palette's `#` jump): by order number, phone, name
// or the courier's tracking number, typed the way people type them: Bengali digits (০১৭…), a phone with or without
// +880, spaces or dashes, part of a number, any letter case. One query, read only, in the person's store.
import type { Prisma } from '@extas/db/client';

/** Bengali digits as Western ones (the team types either). */
export const westernDigits = (s: string): string => s.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6));

/** Looks like a phone number (digits with + spaces dashes or brackets only), so it is matched against phones. */
const PHONE_LIKE = /^[\d\s+\-().]+$/;

/** The words of a search, cleaned: Western digits, trimmed, inner spaces squeezed. */
export function searchText(raw: string): string {
  return westernDigits(raw).trim().replace(/\s+/g, ' ');
}

/**
 * The condition for one search box query: the order number, the customer's name, the tracking number of any of
 * its shipments, and, for what looks like a phone, the stored phone (+8801…) containing the typed digits (so
 * "01712 345678", "+880 1712-345678" and "345678" all find it). Empty text finds everything.
 */
export function orderSearchWhere(raw: string | undefined | null): Prisma.OrderWhereInput {
  const text = searchText(raw ?? '');
  if (!text) return {};
  const any: Prisma.OrderWhereInput[] = [
    { number: { contains: text, mode: 'insensitive' } },
    { customerName: { contains: text, mode: 'insensitive' } },
    { shipments: { some: { trackingCode: { contains: text.replace(/\s/g, ''), mode: 'insensitive' } } } },
  ];
  const digits = text.replace(/\D/g, '');
  if (digits && PHONE_LIKE.test(text)) any.push({ phone: { contains: digits } });
  return { OR: any };
}
