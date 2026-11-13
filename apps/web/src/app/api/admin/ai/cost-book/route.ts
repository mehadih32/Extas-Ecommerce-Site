// S15 · PR 312 — /api/admin/ai/cost-book: GET the AI Cost Book (`ai.read`); POST {jobKey, modelKey} changes one
// job's own model (`ai.control`). lib/admin-ai/cost-book-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { costBookHandler } from '@/lib/admin-ai/cost-book-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => costBookHandler(request, adminDeps());
export const POST = (request: Request) => costBookHandler(request, adminDeps());
