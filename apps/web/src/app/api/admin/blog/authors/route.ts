// S12 · PR 239 — the journal's authors: the list (GET, `blog.read`) and a new author (POST, `blog.write`)
// (lib/journal/journal.ts).
import { adminDeps } from '@/lib/admin-auth';
import { shelfHandler } from '@/lib/journal/journal';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return shelfHandler(request, adminDeps(), 'authors', null);
}

export function POST(request: Request) {
  return shelfHandler(request, adminDeps(), 'authors', null);
}
