// PR 65 — product reviews for staff: the queue with its counters, one review, the shop's own review, and the check
// (approve, hide, refuse, restore, verified).
import { adminDeps } from '@/lib/admin-auth';
import { reviewsHandler } from '@/lib/reviews-api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ path?: string[] }> };

export async function GET(request: Request, { params }: Params) {
  return reviewsHandler(request, adminDeps(), (await params).path ?? []);
}

export async function POST(request: Request, { params }: Params) {
  return reviewsHandler(request, adminDeps(), (await params).path ?? []);
}
