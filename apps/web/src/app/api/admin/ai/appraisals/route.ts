// S15 · PR 578 — /api/admin/ai/appraisals: GET ?key=&period= reads the saved history (`ai.read`); POST
// {key, period} generates it (`ai.control`). lib/admin-ai/appraisal-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { appraisalHandler } from '@/lib/admin-ai/appraisal-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => appraisalHandler(request, adminDeps());
export const POST = (request: Request) => appraisalHandler(request, adminDeps());
