// S15 · PR 577 — /api/admin/agents/:key: GET one agent's 360° profile (`ai.read`); PATCH edits the owner's own
// identity fields; POST {action} gives a reward, assigns a task, or marks one done (`ai.control`).
// lib/admin-ai/agent-profile-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { agentProfileHandler } from '@/lib/admin-ai/agent-profile-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ key: string }> }) {
  return agentProfileHandler(request, adminDeps(), (await ctx.params).key);
}
export async function PATCH(request: Request, ctx: { params: Promise<{ key: string }> }) {
  return agentProfileHandler(request, adminDeps(), (await ctx.params).key);
}
export async function POST(request: Request, ctx: { params: Promise<{ key: string }> }) {
  return agentProfileHandler(request, adminDeps(), (await ctx.params).key);
}
