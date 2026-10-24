// PR 59 — the Find My Size size report, and the link of answer → order line → exchange (follow-up 153).
import { adminDeps } from '@/lib/admin-auth';
import { sizeReportHandler } from '@/lib/catalogue-size-advice-api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ path?: string[] }> };

export async function GET(request: Request, { params }: Params) {
  return sizeReportHandler(request, adminDeps(), (await params).path ?? []);
}

export async function POST(request: Request, { params }: Params) {
  return sizeReportHandler(request, adminDeps(), (await params).path ?? []);
}
