// S15 · PR 318 (Blueprint C3.2 "Permission matrix") — per agent, over the Blueprint's own seven resources (orders,
// stock, prices, courier, money, customer data, code), what that agent may decide alone, may only propose (lands
// in the single approval queue, PR 317), or may not touch at all. `AgentPermission` was already in the full S00
// schema (`@stage S15 · PR 318, 583`), additive, unused until now.
//
// Nobody is told "yes, decide this alone" by default: every cell that has no row yet reads as `propose` — the
// same "off/safe until the owner says otherwise" default every other owner-set switch in this codebase ships with
// (CLAUDE.md rule 1, CN-018). The owner widens a cell to `alone` only by setting it here; nothing this PR ships
// changes that on its own. `agentMayActAlone`/`agentPermissionLevel` are the enforcement primitives — pure and
// tested, ready for the first real agent action (PR 583's chief-agent routing, S24's Photoshoot agent, S15's own
// job dispatcher) the same way PR 309's `agentCapState`/`wouldExceedCap` were ready before any provider was keyed:
// nothing in this codebase executes a real agent action yet, so nothing calls them in production. That is honest,
// not a gap — the matrix itself, and the queue it feeds, are fully real today.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import type { Prisma, PrismaClient } from '@extas/db/client';
import { AI_AGENTS, isAiAgentKey, type AiAgentKey } from './agents';
import { ensureAgentRows } from './control-room';
import { AiError } from './errors';

/** The Blueprint's own seven resources (C3.2), in the order it lists them. A closed list on purpose — a resource
 * an agent may touch is a structural fact, decided when a new kind of AI action is built, never the owner's own
 * number or text (CLAUDE.md rule 4), so unlike `KNOWN_KINDS` (approvals.ts) this one is never "falls back to the
 * raw string": a resource outside this list is a programming mistake, not an owner's or an agent's input. */
export const RESOURCES = [
  { key: 'orders', nameEn: 'Orders', nameBn: 'অর্ডার' },
  { key: 'stock', nameEn: 'Stock', nameBn: 'স্টক' },
  { key: 'prices', nameEn: 'Prices', nameBn: 'দাম' },
  { key: 'courier', nameEn: 'Courier', nameBn: 'কুরিয়ার' },
  { key: 'money', nameEn: 'Money', nameBn: 'টাকা' },
  { key: 'customerData', nameEn: 'Customer data', nameBn: 'কাস্টমারের তথ্য' },
  { key: 'code', nameEn: 'Code', nameBn: 'কোড' },
] as const satisfies readonly { key: string; nameEn: string; nameBn: string }[];

export type ResourceKey = (typeof RESOURCES)[number]['key'];

export function isResourceKey(key: string): key is ResourceKey {
  return (RESOURCES as readonly { key: string }[]).some((r) => r.key === key);
}

export function resourceLabel(key: string, lang: 'en' | 'bn'): string {
  const found = RESOURCES.find((r) => r.key === key);
  if (!found) return key;
  return lang === 'bn' ? found.nameBn : found.nameEn;
}

/** `alone` — the agent decides and acts, no owner tap needed. `propose` — the agent may only ask (PR 317's single
 * approval queue); the default for every cell the owner has not widened. `none` — the agent may not touch this
 * resource at all, not even to propose (C3.2's worked example: "the Photoshoot agent may write to media only —
 * never to price, stock, orders or customer data"). */
export const LEVELS = ['alone', 'propose', 'none'] as const;
export type PermissionLevel = (typeof LEVELS)[number];

export function isPermissionLevel(v: string): v is PermissionLevel {
  return (LEVELS as readonly string[]).includes(v);
}

/** The safe, off-by-default level of any cell the owner has never set (CLAUDE.md rule 1, CN-018). */
export const DEFAULT_LEVEL: PermissionLevel = 'propose';

export function agentMayActAlone(level: PermissionLevel): boolean {
  return level === 'alone';
}

export function agentMayProposeOrAct(level: PermissionLevel): boolean {
  return level !== 'none';
}

export interface PermissionsDeps {
  db: PrismaClient;
}

export interface PermissionCell {
  resource: ResourceKey;
  level: PermissionLevel;
  /** True when this cell has never been set by the owner and is showing `DEFAULT_LEVEL` — so the page can say so,
   * never pretending the owner chose a value they never touched. */
  isDefault: boolean;
}

export interface PermissionAgentRow {
  key: AiAgentKey;
  nameEn: string;
  nameBn: string;
  role: string;
  emoji: string;
  isChief: boolean;
  cells: PermissionCell[];
}

export interface PermissionsView {
  resources: readonly { key: ResourceKey; nameEn: string; nameBn: string }[];
  agents: PermissionAgentRow[];
}

/** The owner's own matrix: every fixed agent, every resource, the level that applies — set or default, always
 * one concrete answer, never a blank cell. */
export async function permissionsView(deps: PermissionsDeps): Promise<PermissionsView> {
  await ensureAgentRows(deps.db);
  const rows = await deps.db.aiAgent.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'asc' } });
  const byKey = new Map(rows.filter((r) => isAiAgentKey(r.key)).map((r) => [r.key as AiAgentKey, r]));
  const ids = [...byKey.values()].map((r) => r.id);
  const perms = ids.length ? await deps.db.agentPermission.findMany({ where: { agentId: { in: ids } } }) : [];
  const byAgentResource = new Map(perms.map((p) => [`${p.agentId}:${p.resource}`, p.level]));

  const agents: PermissionAgentRow[] = AI_AGENTS.map((a) => {
    const row = byKey.get(a.key);
    const cells: PermissionCell[] = RESOURCES.map((r) => {
      const stored = row ? byAgentResource.get(`${row.id}:${r.key}`) : undefined;
      const level = stored && isPermissionLevel(stored) ? stored : DEFAULT_LEVEL;
      return { resource: r.key, level, isDefault: stored === undefined };
    });
    return { key: a.key, nameEn: a.nameEn, nameBn: a.nameBn, role: a.role, emoji: a.emoji, isChief: a.isChief, cells };
  });

  return { resources: RESOURCES, agents };
}

/** The owner's own decision on one cell. A no-op when it already is what was asked (the common double tap, same
 * as every other switch here), audited otherwise. Setting a cell back to `DEFAULT_LEVEL` still writes an explicit
 * row — the owner's own choice to match the default is still a choice, worth the same audit trail as any other,
 * and `isDefault` on the view only ever means "never touched", not "happens to equal the default". */
export async function setAgentPermission(
  deps: PermissionsDeps,
  who: { actor: Actor; ctx?: RequestContext },
  agentKey: string,
  resource: string,
  level: string,
): Promise<void> {
  if (!isAiAgentKey(agentKey)) throw new AiError(404, 'NOT_FOUND', ['agentKey']);
  if (!isResourceKey(resource)) throw new AiError(422, 'INVALID_INPUT', ['resource']);
  if (!isPermissionLevel(level)) throw new AiError(422, 'INVALID_INPUT', ['level']);
  await ensureAgentRows(deps.db);
  await deps.db.$transaction(async (tx: Prisma.TransactionClient) => {
    const agent = await tx.aiAgent.findUnique({ where: { key: agentKey } });
    if (!agent || agent.archivedAt) throw new AiError(404, 'NOT_FOUND', ['agentKey']);
    const existing = await tx.agentPermission.findUnique({ where: { agentId_resource: { agentId: agent.id, resource } } });
    const before = existing?.level ?? DEFAULT_LEVEL;
    if (before === level) return;
    await tx.agentPermission.upsert({
      where: { agentId_resource: { agentId: agent.id, resource } },
      create: { agentId: agent.id, resource, level },
      update: { level },
    });
    await audit(
      tx,
      who.actor,
      { action: 'ai.permission.set', entityType: 'AgentPermission', entityId: agent.id, before: { resource, level: before }, after: { resource, level } },
      who.ctx ?? {},
    );
  });
}

/** The enforcement primitive a future agent action calls before it decides whether to act alone, only propose, or
 * refuse outright — not called by anything in this codebase yet (see the file header). */
export async function agentPermissionLevel(deps: PermissionsDeps, agentKey: string, resource: string): Promise<PermissionLevel> {
  if (!isAiAgentKey(agentKey) || !isResourceKey(resource)) return DEFAULT_LEVEL;
  const agent = await deps.db.aiAgent.findUnique({ where: { key: agentKey } });
  if (!agent) return DEFAULT_LEVEL;
  const row = await deps.db.agentPermission.findUnique({ where: { agentId_resource: { agentId: agent.id, resource } } });
  return row && isPermissionLevel(row.level) ? row.level : DEFAULT_LEVEL;
}
