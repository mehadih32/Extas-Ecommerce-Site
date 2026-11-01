// S13 · PR 262 / 263 — how many people an audience holds now, nothing saved (GET ?definition=<json>, or ?lookalike=<json> for a lookalike seed;
// `marketing.audiences.read`; a few masked names only with `customers.read`; lib/marketing/audiences.ts).
import { adminDeps } from '@/lib/admin-auth';
import { audienceCountHandler } from '@/lib/marketing/audiences';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return audienceCountHandler(request, adminDeps());
}
