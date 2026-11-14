// S15 · PR 582 — /api/admin/agents/:key/memory: GET one agent's memory (`ai.read`): the feature's on/off state,
// its live list (optionally filtered by `kind`/`search`/`archived`), and the weekly digest. POST (`ai.control`):
// {action: 'toggle', enabled} flips the one shared `ai.memory.enabled` switch; {action: 'add', kind, content,
// tags?, sourceRef?} lets the owner write a memory by hand (an instruction, a lesson, ...), refused with
// `MEMORY_OFF` while the switch is off; {action: 'correct', memoryId, content?, tags?} edits a row's own words;
// {action: 'archive'|'restore', memoryId} archives or restores one, never deletes it. Every shape hands back the
// fresh view, the same "never a second GET after a tap" shape every other AI 360 handler in this folder uses.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import {
  agentMemoryBrief,
  correctAgentMemory,
  listAgentMemories,
  memoryEnabled,
  recordAgentMemory,
  setAgentMemoryArchived,
  setMemoryEnabled,
  weeklyAgentMemoryDigest,
} from './agent-memory';
import { isAiAgentKey } from './agents';
import { isAiError } from './errors';

export async function agentMemoryHandler(request: Request, deps: AdminDeps | null, key: string): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'ai.read' : 'ai.control', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  if (!isAiAgentKey(key)) return json({ ok: false, error: 'NOT_FOUND', details: ['key'] }, { status: 404 });
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now };
  const who = { actor: g.actor, ctx: g.ctx };

  const withScreen = async () =>
    json({
      ok: true,
      memoryOn: await memoryEnabled(d, MOTHER_STORE_ID),
      memories: await listAgentMemories(d, key, { includeArchived: true }),
      digest: await weeklyAgentMemoryDigest(d, key),
    });

  try {
    if (method === 'GET') {
      const url = new URL(request.url);
      const search = url.searchParams.get('search') ?? undefined;
      const kind = url.searchParams.get('kind') ?? undefined;
      const includeArchived = url.searchParams.get('archived') === '1';
      return json({
        ok: true,
        memoryOn: await memoryEnabled(d, MOTHER_STORE_ID),
        memories: await listAgentMemories(d, key, { search, kind, includeArchived }),
        brief: await agentMemoryBrief(d, key),
        digest: await weeklyAgentMemoryDigest(d, key),
      });
    }

    const input = await body(request);
    if (input.action === 'toggle') {
      if (typeof input.enabled !== 'boolean') return json({ ok: false, error: 'INVALID_INPUT', details: ['enabled'] }, { status: 400 });
      await setMemoryEnabled(d, who, input.enabled, MOTHER_STORE_ID);
      return withScreen();
    }
    if (input.action === 'add') {
      if (typeof input.kind !== 'string' || typeof input.content !== 'string') return json({ ok: false, error: 'INVALID_INPUT', details: ['kind', 'content'] }, { status: 400 });
      const created = await recordAgentMemory(
        d,
        key,
        { kind: input.kind, content: input.content, tags: Array.isArray(input.tags) ? input.tags.filter((t): t is string => typeof t === 'string') : undefined, sourceRef: typeof input.sourceRef === 'string' ? input.sourceRef : null },
        MOTHER_STORE_ID,
      );
      if (!created) return json({ ok: false, error: 'MEMORY_OFF', details: [] }, { status: 409 });
      return withScreen();
    }
    if (input.action === 'correct') {
      if (typeof input.memoryId !== 'string') return json({ ok: false, error: 'INVALID_INPUT', details: ['memoryId'] }, { status: 400 });
      await correctAgentMemory(d, who, key, input.memoryId, {
        content: typeof input.content === 'string' ? input.content : undefined,
        tags: Array.isArray(input.tags) ? input.tags.filter((t): t is string => typeof t === 'string') : undefined,
      });
      return withScreen();
    }
    if (input.action === 'archive' || input.action === 'restore') {
      if (typeof input.memoryId !== 'string') return json({ ok: false, error: 'INVALID_INPUT', details: ['memoryId'] }, { status: 400 });
      await setAgentMemoryArchived(d, who, key, input.memoryId, input.action === 'archive');
      return withScreen();
    }
    return json({ ok: false, error: 'INVALID_INPUT', details: ['action'] }, { status: 400 });
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
