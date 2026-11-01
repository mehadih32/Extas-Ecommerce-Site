// S14 · PR 293 — the AI campaign writer's API (lib/ai-copy-api.ts).
import { adminDeps } from '@/lib/admin-auth';
import { aiCopyRoute } from '@/lib/ai-copy-api';

export const dynamic = 'force-dynamic';

export const POST = (request: Request) => aiCopyRoute(request, adminDeps());
