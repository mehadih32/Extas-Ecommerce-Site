// S12 · PR 251 — readers' comments: GET the page (`blog.read`); POST {ids, to: APPROVED | HIDDEN | back} and PUT the card
// `blog.comments` (`blog.publish`) (lib/journal/comments.ts).
import { adminDeps } from '@/lib/admin-auth';
import { commentsHandler } from '@/lib/journal/comments';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return commentsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return commentsHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return commentsHandler(request, adminDeps());
}
