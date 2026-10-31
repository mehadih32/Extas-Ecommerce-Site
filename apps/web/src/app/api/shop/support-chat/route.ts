// PR 426 — public: the shop's live chat (off as it ships, `support.liveChat`). The paths are in lib/shop/support-chat.ts.
import { adminDeps } from '@/lib/admin-auth';
import { supportChatHandler } from '@/lib/shop/support-chat';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return supportChatHandler(request, adminDeps());
}

export function POST(request: Request) {
  return supportChatHandler(request, adminDeps());
}
