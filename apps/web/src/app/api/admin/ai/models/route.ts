// S15 · PR 580 — /api/admin/ai/models: GET the Model picks screen (`ai.read`); POST every control shape
// (`ai.control`). lib/admin-ai/model-qualification-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { modelQualificationHandler } from '@/lib/admin-ai/model-qualification-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => modelQualificationHandler(request, adminDeps());
export const POST = (request: Request) => modelQualificationHandler(request, adminDeps());
