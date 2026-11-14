// S15 · PR 583 — /api/admin/ai/agents-chief/warn: POST {agentKey, why, investigationId?} writes a warning into an
// agent's appraisal (`ai.control`).
import { adminDeps } from '@/lib/admin-auth';
import { agentsChiefWarnHandler } from '@/lib/admin-ai/investigations-api';

export const dynamic = 'force-dynamic';

export const POST = (request: Request) => agentsChiefWarnHandler(request, adminDeps());
