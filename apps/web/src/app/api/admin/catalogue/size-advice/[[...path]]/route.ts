// PR 59 — the trained Find My Size versions: the list, training a new one, switching one on or off.
import { adminDeps } from '@/lib/admin-auth';
import { sizeAdviceHandler } from '@/lib/catalogue-size-advice-api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ path?: string[] }> };

export async function GET(request: Request, { params }: Params) {
  return sizeAdviceHandler(request, adminDeps(), (await params).path ?? []);
}

export async function POST(request: Request, { params }: Params) {
  return sizeAdviceHandler(request, adminDeps(), (await params).path ?? []);
}
