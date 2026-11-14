// S15 · PR 585 — /api/admin/ai/learning: GET the screen (`ai.read`); PUT the master-switch/quality-gate card
// (`ai.control`); POST the sources/tips/practice-task/paid-tool actions. lib/admin-ai/learning-engine-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { learningEngineHandler } from '@/lib/admin-ai/learning-engine-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => learningEngineHandler(request, adminDeps());
export const PUT = (request: Request) => learningEngineHandler(request, adminDeps());
export const POST = (request: Request) => learningEngineHandler(request, adminDeps());
