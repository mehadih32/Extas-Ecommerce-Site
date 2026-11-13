// S28 · PR 699 — Marketing › Overview and Plan: the verdict numbers (POST /settings, `marketing.campaigns.write`) and the writer
// for one ad's day (POST /ad-day {adId, day, spendStoreMinor, impressions, clicks, purchases}; the platform sync uses the same
// writer, a hand entry is for the shop's own figures). Nothing here changes an ad account.
import { adminDeps, body } from '@/lib/admin-auth';
import { notAllowed, notFound, saveV5Switch, v5Handle } from '@/lib/admin-v5-api';
import { recordAdCreativeDay } from '@/lib/marketing/overview';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => {
  const path = (await ctx.params).path ?? [];
  if (request.method.toUpperCase() !== 'POST') return notAllowed();
  if (path.length !== 1) return notFound();
  if (path[0] === 'settings') return v5Handle(request, adminDeps(), 'marketing.campaigns.write', (x) => saveV5Switch(request, x, ['marketing.verdicts']));
  if (path[0] === 'ad-day')
    return v5Handle(request, adminDeps(), 'marketing.campaigns.write', async (x) => {
      const b = (await body(request)) as Record<string, unknown>;
      const n = (v: unknown) => (typeof v === 'number' ? v : Number.NaN);
      try {
        await recordAdCreativeDay(x.admin.db, { adId: String(b.adId ?? ''), day: String(b.day ?? ''), spendStoreMinor: n(b.spendStoreMinor), impressions: n(b.impressions), clicks: n(b.clicks), purchases: n(b.purchases) });
      } catch (e) {
        if (e instanceof RangeError) return new Response(JSON.stringify({ ok: false, error: e.message }), { status: e.message === 'AD_NOT_FOUND' ? 404 : 400, headers: { 'content-type': 'application/json' } });
        throw e;
      }
      return { saved: true };
    });
  return notFound();
};

export const POST = run;
