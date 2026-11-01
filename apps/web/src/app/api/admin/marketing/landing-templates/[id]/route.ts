// S13 · PR 255 — one own landing page template: POST {action: archive | restore, version} (`marketing.landing.write`;
// lib/marketing/landing-templates.ts). Nothing is deleted.
import { adminDeps } from '@/lib/admin-auth';
import { landingTemplatesHandler } from '@/lib/marketing/landing-templates';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  return landingTemplatesHandler(request, adminDeps(), (await ctx.params).id);
}
