// S12 · PR 591 — the blog content pipeline: GET the page (`blog.read`); PUT the card `blog.pipeline` (`blog.publish`)
// (lib/journal/pipeline.ts).
import { adminDeps } from '@/lib/admin-auth';
import { pipelineHandler } from '@/lib/journal/pipeline';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return pipelineHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return pipelineHandler(request, adminDeps());
}
