// PR 41 · follow-up 21 — public, read-only: a product card's back view and the sizes for "Quick add"
// (lib/shop/card-quick.ts), read when a computer's mouse or the keyboard first reaches the card.
import { quickCardHandler } from '@/lib/shop/card-quick';
import { shopStoreId } from '@/lib/shop/context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return quickCardHandler(request, (await ctx.params).id, shopStoreId());
}
