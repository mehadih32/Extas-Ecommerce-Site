// S15 · PR 321 — /api/admin/ai/skills: GET the skill library (`ai.read`); POST import/rollback/enable
// (`ai.skills.write`). lib/admin-ai/skills-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { skillsHandler } from '@/lib/admin-ai/skills-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => skillsHandler(request, adminDeps());
export const POST = (request: Request) => skillsHandler(request, adminDeps());
