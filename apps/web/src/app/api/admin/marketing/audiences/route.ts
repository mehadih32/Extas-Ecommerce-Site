// S13 · PR 262 — Marketing › Audiences: the list (GET, `marketing.audiences.read`) and a new audience (POST,
// `marketing.audiences.write`) (lib/marketing/audiences.ts). Nothing is sent to an ad platform.
import { adminDeps } from '@/lib/admin-auth';
import { audiencesHandler } from '@/lib/marketing/audiences';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return audiencesHandler(request, adminDeps(), null);
}

export function POST(request: Request) {
  return audiencesHandler(request, adminDeps(), null);
}
