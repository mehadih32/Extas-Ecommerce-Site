// S15 · PR 582: /api/admin/agents/:key/memory: GET one agent's memory (`ai.read`); POST {action} writes to it
// (`ai.control`). lib/admin-ai/agent-memory-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { agentMemoryHandler } from '@/lib/admin-ai/agent-memory-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ key: string }> }) {
  return agentMemoryHandler(request, adminDeps(), (await ctx.params).key);
}
export async function POST(request: Request, ctx: { params: Promise<{ key: string }> }) {
  return agentMemoryHandler(request, adminDeps(), (await ctx.params).key);
}
