// PR 551 — "Try an address": the owner types a line and sees what the checkout would do with it.
import { adminDeps } from '@/lib/admin-auth';
import { tryAddressHandler } from '@/lib/delivery-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return tryAddressHandler(request, adminDeps());
}
