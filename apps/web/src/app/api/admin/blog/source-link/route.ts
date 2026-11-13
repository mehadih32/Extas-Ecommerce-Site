// S12 · PR 529 — the source-link research writer: the screen (GET, `blog.read`), a new draft written straight from a
// link (POST {url, locale, wordCount?}, `blog.write`) and its "Write from a link" card (PUT {value, version},
// `blog.publish`) (lib/journal/source-link.ts).
import { adminDeps } from '@/lib/admin-auth';
import { sourceLinkHandler } from '@/lib/journal/source-link';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return sourceLinkHandler(request, adminDeps());
}

export function POST(request: Request) {
  return sourceLinkHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return sourceLinkHandler(request, adminDeps());
}
