// S28 · PR 713 — /api/admin/ai/training/extras: the sandbox, saved corrections, reference documents and problem notes (`ai.control`).
// lib/admin-ai/training-extras-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { extrasHandler } from '@/lib/admin-ai/training-extras-api';

export const dynamic = 'force-dynamic';

export const POST = (request: Request) => extrasHandler(request, adminDeps());
