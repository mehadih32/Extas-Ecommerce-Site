// PR 130 — public: signing in by SMS code or password, logging out, setting a password (lib/shop/account-api.ts).
import { accountApiDeps } from '@/lib/shop/account';
import { accountHandler } from '@/lib/shop/account-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  return accountHandler(request, accountApiDeps(), (await params).action);
}
