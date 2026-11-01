// S16 · PR 352 — the team badges setting (Reports → Team). The route is described in lib/team-performance.ts.
import { adminDeps } from '@/lib/admin-auth';
import { teamRoute } from '@/lib/team-performance';

export const dynamic = 'force-dynamic';

export const PUT = (request: Request) => teamRoute(request, adminDeps());
