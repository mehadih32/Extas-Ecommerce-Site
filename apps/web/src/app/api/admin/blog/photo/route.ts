// S12 · PR 547 — an article's main photo: GET ?id=<article> the picker (`blog.read`); PUT {id, assetId|null} picks or
// takes it off (`blog.write`); PUT {key: 'blog.images', on, values} the card (`blog.publish`; lib/journal/images.ts).
import { adminDeps } from '@/lib/admin-auth';
import { photoHandler } from '@/lib/journal/images';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return photoHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return photoHandler(request, adminDeps());
}
