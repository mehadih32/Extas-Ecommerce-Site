// PR 590 — apply the templates to products: preview first, then apply with the hash.
import { adminDeps } from '@/lib/admin-auth';
import { namingTemplatesHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return namingTemplatesHandler(request, adminDeps());
}
