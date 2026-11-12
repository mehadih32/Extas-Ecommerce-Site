// S15 · PR 319 — /api/admin/ai/diary: GET the diary (`ai.read`). lib/admin-ai/diary-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { diaryHandler } from '@/lib/admin-ai/diary-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => diaryHandler(request, adminDeps());
