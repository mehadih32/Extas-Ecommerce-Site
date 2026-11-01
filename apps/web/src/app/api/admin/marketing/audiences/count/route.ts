// S13 · PR 262 — how many people an audience's conditions hold now, nothing saved (GET ?definition=<json>,
// `marketing.audiences.read`; a few masked names only with `customers.read`; lib/marketing/audiences.ts).
import { adminDeps } from '@/lib/admin-auth';
import { audienceCountHandler } from '@/lib/marketing/audiences';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return audienceCountHandler(request, adminDeps());
}
