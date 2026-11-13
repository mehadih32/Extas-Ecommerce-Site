// S15 · PR 323 — /api/admin/ai/training: GET the recorded training examples (`ai.read`), optionally narrowed with
// `?agent=`/`?skill=`. lib/admin-ai/training-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { trainingHandler } from '@/lib/admin-ai/training-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => trainingHandler(request, adminDeps());
