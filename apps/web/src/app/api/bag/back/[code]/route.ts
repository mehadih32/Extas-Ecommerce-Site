// PR 275 — public: the link in an unfinished checkout's follow-up message puts that bag back in this browser and opens
// it (a code on the bag only when the offer with it went to him). Nothing is ordered.
import { watchShop } from '@/lib/problems/server';
import { bagBackHandler } from '@/lib/shop/bag-api';
import { bagApiDeps } from '@/lib/shop/bag-deps';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ code: string }> };

export const GET = watchShop('bag', '/api/bag/back', async (request: Request, ctx: Params) => bagBackHandler(request, bagApiDeps(), (await ctx.params).code));
