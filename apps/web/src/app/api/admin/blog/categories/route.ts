// S12 · PR 239 — the journal's categories: the list (GET, `blog.read`) and a new category (POST, `blog.write`)
// (lib/journal/journal.ts).
import { adminDeps } from '@/lib/admin-auth';
import { shelfHandler } from '@/lib/journal/journal';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return shelfHandler(request, adminDeps(), 'categories', null);
}

export function POST(request: Request) {
  return shelfHandler(request, adminDeps(), 'categories', null);
}
