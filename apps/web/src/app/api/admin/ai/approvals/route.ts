// S15 · PR 317 — /api/admin/ai/approvals: GET the queue (`ai.read`); POST {id, decision, note?} decides one
// pending request (`ai.control`). lib/admin-ai/approvals-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { approvalsHandler } from '@/lib/admin-ai/approvals-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => approvalsHandler(request, adminDeps());
export const POST = (request: Request) => approvalsHandler(request, adminDeps());
