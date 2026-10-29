// S11 · PR 220–222 — the Website → SEO admin routes: the settings and (PR 221) the AI drafts, lib/seo/admin-api.ts.
import { adminDeps, fail } from '@/lib/admin-auth';
import { seoDraftsRoute, seoSettingsRoute } from '@/lib/seo/admin-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

async function run(request: Request, ctx: Ctx): Promise<Response> {
  const path = (await ctx.params).path ?? [];
  if (path.length === 0) return seoSettingsRoute(request, adminDeps());
  if (path[0] === 'drafts') return seoDraftsRoute(request, adminDeps(), path.slice(1));
  return fail(404, 'not-found');
}

export const GET = run;
export const PUT = run;
export const POST = run;
