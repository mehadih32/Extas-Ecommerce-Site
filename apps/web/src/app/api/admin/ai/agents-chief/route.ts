// S15 · PR 583 — /api/admin/ai/agents-chief: GET the investigations (`ai.read`); POST {question} asks the chief
// a new one (`ai.control`). lib/admin-ai/investigations-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { agentsChiefHandler } from '@/lib/admin-ai/investigations-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => agentsChiefHandler(request, adminDeps());
export const POST = (request: Request) => agentsChiefHandler(request, adminDeps());
