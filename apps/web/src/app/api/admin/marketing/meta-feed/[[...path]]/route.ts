// S28 · PR 696 — Marketing › Meta feed: the switch `marketing.metaFeed` (POST /settings, `marketing.campaigns.write`).
import { adminDeps } from '@/lib/admin-auth';
import { notAllowed, notFound, saveV5Switch, v5Handle } from '@/lib/admin-v5-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => {
  const path = (await ctx.params).path ?? [];
  if (request.method.toUpperCase() !== 'POST') return notAllowed();
  if (path.length !== 1 || path[0] !== 'settings') return notFound();
  return v5Handle(request, adminDeps(), 'marketing.campaigns.write', (x) => saveV5Switch(request, x, ['marketing.metaFeed']));
};

export const POST = run;
