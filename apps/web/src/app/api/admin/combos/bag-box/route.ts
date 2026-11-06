// S02 · PR 598 — Products › Combos › Bag tier box: GET the box's switch, days, size, rules shown and words
// (`combos.read`); PUT them (`combos.write`) (lib/website/bag-box-admin.ts). No price is read or written here.
import { adminDeps } from '@/lib/admin-auth';
import { bagBoxHandler } from '@/lib/website/bag-box-admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => bagBoxHandler(request, adminDeps());
export const PUT = (request: Request) => bagBoxHandler(request, adminDeps());
