// Health check for Docker, Caddy's load balancer and the deploy smoke test (deploy.yml).
// Review R1 m4 / R2 (security): the commit and the blue/green colour go only to the preview host and the server's own
// internal checks (lib/status-host.ts); any other host gets the bare answer.
import { detailForHost } from '@/lib/status-host';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const detail = await detailForHost(request.headers.get('host'));
  return Response.json(
    detail ? { ok: true, commit: process.env.GIT_SHA ?? null, color: process.env.EXTAS_COLOR ?? null } : { ok: true },
    { headers: { 'cache-control': 'no-store' } },
  );
}
