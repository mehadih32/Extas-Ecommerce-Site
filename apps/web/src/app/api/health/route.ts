// Health check for Docker, Caddy's load balancer and the deploy smoke test (deploy.yml).
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { ok: true, commit: process.env.GIT_SHA ?? null, color: process.env.EXTAS_COLOR ?? null },
    { headers: { 'cache-control': 'no-store' } },
  );
}
