// S28 · PR 713 — /api/admin/ai/training/instructions: GET the Training screen (`ai.read`); PUT the page's options card and POST the
// instruction changes and "restore this version" (`ai.control`). lib/admin-ai/training-instructions-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { instructionsHandler } from '@/lib/admin-ai/training-instructions-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => instructionsHandler(request, adminDeps());
export const PUT = (request: Request) => instructionsHandler(request, adminDeps());
export const POST = (request: Request) => instructionsHandler(request, adminDeps());
