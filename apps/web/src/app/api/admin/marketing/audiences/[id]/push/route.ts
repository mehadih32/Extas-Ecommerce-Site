// S13 · PR 263 — POST /api/admin/marketing/audiences/<id>/push {version}: send the audience (hashed) to the ad
// platforms (`marketing.audiences.write`; refused while `ads.audiences.push` is off). See lib/marketing/audience-push.ts.
import { adminDeps } from '@/lib/admin-auth';
import { audiencePushHandler } from '@/lib/marketing/audience-push';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  return audiencePushHandler(request, adminDeps(), (await ctx.params).id);
}
