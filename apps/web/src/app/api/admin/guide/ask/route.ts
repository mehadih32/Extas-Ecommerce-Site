// PR 334 — the System Q&A agent: one AI-grounded Bengali answer to a question about the page's own already-written
// guide text (lib/admin-shell/api.ts guideAskHandler, lib/admin-ai/guide-qa-dispatch.ts).
import { guideAskHandler } from '@/lib/admin-shell/api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return guideAskHandler(request);
}
