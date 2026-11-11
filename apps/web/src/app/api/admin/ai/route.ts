// S15 · PR 304 — /api/admin/ai: GET the Control room (`ai.read`); POST {key, enabled} pauses or resumes one agent
// (`ai.control`). lib/admin-ai/control-room-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { controlRoomHandler } from '@/lib/admin-ai/control-room-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => controlRoomHandler(request, adminDeps());
export const POST = (request: Request) => controlRoomHandler(request, adminDeps());
