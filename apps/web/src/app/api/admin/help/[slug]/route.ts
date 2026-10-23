// PR 6 (follow-up 84), PR 12 — SH-05, one admin guide from the deployed docs copy (lib/admin-shell/guide.ts).
import { helpHandler } from '@/lib/admin-shell/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return helpHandler(request, (await params).slug);
}
