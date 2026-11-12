// S15 · PR 331 — Marketing › Studio's "Draft a caption with AI" button, for a reel/short render-queue template.
import { adminDeps } from '@/lib/admin-auth';
import { studioAiCaptionHandler } from '@/lib/admin-ai/social-caption-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return studioAiCaptionHandler(request, adminDeps());
}
