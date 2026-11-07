// PR 66 follow-up 184 — product questions for staff: the list, the shop's answer and the check (publish, hide, back
// to the queue, archive, bring back). See lib/questions-api.
import { adminDeps } from '@/lib/admin-auth';
import { questionsHandler } from '@/lib/questions-api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ path?: string[] }> };

export async function GET(request: Request, { params }: Params) {
  return questionsHandler(request, adminDeps(), (await params).path ?? []);
}

export async function POST(request: Request, { params }: Params) {
  return questionsHandler(request, adminDeps(), (await params).path ?? []);
}
