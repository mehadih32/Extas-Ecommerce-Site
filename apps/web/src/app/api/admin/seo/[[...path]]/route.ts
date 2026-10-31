// S11 · PR 220–222 — the Website → SEO admin routes: the settings and (PR 221) the AI drafts, lib/seo/admin-api.ts.
// PR 235: the redirects and the 404 report, lib/seo/redirects-admin.ts. PR 228: "Make the sitemaps now", lib/seo/sitemap-admin.ts.
// PR 232: "Write them now" (the photo descriptions), lib/seo/alt-text-data.ts. PR 233: "Send the sitemap", lib/seo/search-engines.ts.
import { adminDeps, fail } from '@/lib/admin-auth';
import { seoDraftsRoute, seoSettingsRoute } from '@/lib/seo/admin-api';
import { seoRedirectsRoute } from '@/lib/seo/redirects-admin';
import { seoSitemapsRoute } from '@/lib/seo/sitemap-admin';
import { seoAltTextRoute } from '@/lib/seo/alt-text-data';
import { seoSearchEnginesRoute } from '@/lib/seo/search-engines';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

async function run(request: Request, ctx: Ctx): Promise<Response> {
  const path = (await ctx.params).path ?? [];
  if (path.length === 0) return seoSettingsRoute(request, adminDeps());
  if (path[0] === 'drafts') return seoDraftsRoute(request, adminDeps(), path.slice(1));
  if (path[0] === 'redirects') return seoRedirectsRoute(request, adminDeps(), path.slice(1));
  if (path[0] === 'sitemaps') return seoSitemapsRoute(request, adminDeps(), path.slice(1));
  if (path[0] === 'alt-text') return seoAltTextRoute(request, adminDeps(), path.slice(1));
  if (path[0] === 'search-engines') return seoSearchEnginesRoute(request, adminDeps(), path.slice(1));
  return fail(404, 'not-found');
}

export const GET = run;
export const PUT = run;
export const POST = run;
