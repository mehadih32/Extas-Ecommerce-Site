// PR 12 (CN-025, CN-026 (b)) — a person's own look (design per page, where the guide opens) or the team's
// (lib/admin-look/api.ts). The page and design are checked against the look registry.
import { lookCatalog } from '@/components/admin/look/registry';
import { lookHandler } from '@/lib/admin-look/api';

export const dynamic = 'force-dynamic';

export function PUT(request: Request) {
  return lookHandler(request, lookCatalog());
}
