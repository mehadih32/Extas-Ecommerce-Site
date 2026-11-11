// S15 · PR 318 — /api/admin/ai/permissions: GET the permission matrix (`ai.read`); POST {agentKey, resource, level}
// sets one cell (`ai.control`). lib/admin-ai/permissions-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { permissionsHandler } from '@/lib/admin-ai/permissions-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => permissionsHandler(request, adminDeps());
export const POST = (request: Request) => permissionsHandler(request, adminDeps());
