// S15 · PR 577 — /api/admin/agents: GET the team — every fixed agent's identity and assignment counts (`ai.read`).
// lib/admin-ai/agent-profile-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { agentsListHandler } from '@/lib/admin-ai/agent-profile-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => agentsListHandler(request, adminDeps());
