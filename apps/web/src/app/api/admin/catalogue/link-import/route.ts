// PR 33 — import a product from a link: the screen's data, read a page (preview), make the draft.
import { adminDeps } from '@/lib/admin-auth';
import { linkImportHandler } from '@/lib/catalogue-tools-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return linkImportHandler(request, adminDeps());
}

export function POST(request: Request) {
  return linkImportHandler(request, adminDeps());
}
