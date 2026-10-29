// S11 · PR 220–222 — the Website → SEO admin routes. The settings: lib/seo/admin-api.ts.
import { adminDeps, fail } from '@/lib/admin-auth';
import { seoSettingsRoute } from '@/lib/seo/admin-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

async function run(request: Request, ctx: Ctx): Promise<Response> {
  const path = (await ctx.params).path ?? [];
  if (path.length === 0) return seoSettingsRoute(request, adminDeps());
  return fail(404, 'not-found');
}

export const GET = run;
export const PUT = run;
export const POST = run;
