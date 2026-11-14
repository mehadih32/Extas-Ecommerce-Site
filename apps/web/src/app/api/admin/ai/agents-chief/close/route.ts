// S15 · PR 583 — /api/admin/ai/agents-chief/close: POST {id} closes an investigation (`ai.control`).
import { adminDeps } from '@/lib/admin-auth';
import { agentsChiefCloseHandler } from '@/lib/admin-ai/investigations-api';

export const dynamic = 'force-dynamic';

export const POST = (request: Request) => agentsChiefCloseHandler(request, adminDeps());
