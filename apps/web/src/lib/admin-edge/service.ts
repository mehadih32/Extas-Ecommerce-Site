// S18 · PR 386 (Blueprint B6.1, B6.3) — Settings › Sign-in & security › Cloudflare protection: the shop's own rules at
// Cloudflare (`edge.shield`), what Cloudflare has now against that plan, and "Send to Cloudflare". Cloudflare's DDoS
// protection is always on; the plan adds the security level, the browser check, SSL Full (strict), refusing the
// addresses robots try, and — off by default — a challenge on the admin sign-in page and a limit on admin sign-in tries.
// Every rule is limited to the shop's host names (the Cloudflare connection's, or the staging host while the mock
// answers) and every rule that is not the shop's is kept as it was (@extas/adapters cdn/shield.ts), so the old shop on
// the same zone is never touched. Until the token passes, the mock answers and nothing leaves the server (A1.3).
//
// Seeing needs `security.read`; saving the plan `settings.write`; sending it `security.write`. The sign-in limit
// refuses people, so only the owner may set or change it (CLAUDE.md rule 6). Every save and send is audited.
import { createHash } from 'node:crypto';
import { audit, isOwner, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { cdnAdapters, createConnections, SHIELD_PHASE_IDS, shieldDiff, shieldRules, type CdnPurger, type EdgeShield, type ShieldDifference, type ShieldPlan } from '@extas/adapters';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { EDGE_PROBE_PATH_LEN, EDGE_PROBE_PATHS_MAX, edgeShieldSchema, INSTALLATION, type EdgeShieldSettings } from '@extas/settings';
import type { Vault } from '@extas/vault';
import { ADMIN_LOGIN } from '../admin-nav';
import type { AppResolver } from '../settings';

export interface EdgeDeps {
  db: PrismaClient;
  resolver: AppResolver;
  vault: Vault | null;
}
export interface EdgeWho {
  actor: Actor;
  ctx: RequestContext;
}

/** The address list's box: every address the setting takes, at its longest, with ", " between. */
export const PROBE_TEXT_MAX = EDGE_PROBE_PATHS_MAX * (EDGE_PROBE_PATH_LEN + 2);

/** The admin's sign-in call (the same address the request limits count as sign-in, lib/security/edge-gate.ts). */
export const ADMIN_LOGIN_API = '/api/admin/auth/login';

/** The card as the page edits it: the address list as one line, the sign-in limit 0 when off. */
export interface EdgeCard {
  key: 'shield';
  value: Omit<EdgeShieldSettings, 'probePaths' | 'adminLoginPer10s'> & { probePaths: string; adminLoginPer10s: number };
  version: string;
}

export interface EdgeView {
  cards: { shield: EdgeCard };
  link: { provider: string; mode: string };
  /** The host names every rule is limited to; empty: no rule can be made yet. */
  hosts: string[];
  hostsFrom: 'connection' | 'staging' | 'none';
  /** The plan's rules. */
  rules: { ref: string; phase: string; action: string }[];
  /** Cloudflare (or the mock) against the plan. */
  state: { error: string | null; differences: ShieldDifference[] };
  lastSent: { at: string; changed: string[]; mode: string } | null;
  canSend: boolean;
  owner: boolean;
}

export class EdgePageError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE' | 'OWNER_ONLY' | 'NO_HOST' | 'SEND_FAILED',
    readonly status: number,
    readonly details: string[] = [],
    readonly data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}
export const isEdgePageError = (e: unknown): e is EdgePageError => e instanceof EdgePageError;

const S = MOTHER_STORE_ID;
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function cardOf(s: EdgeShieldSettings): EdgeCard {
  const value = { ...s, probePaths: s.probePaths.join(', '), adminLoginPer10s: s.adminLoginPer10s ?? 0 };
  return { key: 'shield', value, version: versionOf(value) };
}

async function link(deps: EdgeDeps): Promise<{ shield: EdgeShield | null; provider: string; mode: string }> {
  const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: cdnAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
  const l = await c.use<CdnPurger & { shield?: EdgeShield }>('CDN');
  return { shield: l.api.shield ?? null, provider: l.provider, mode: l.mode };
}

/** The host names the rules are limited to: the connection's; while the mock answers, the staging host. */
async function hostsOf(deps: EdgeDeps, shield: EdgeShield | null): Promise<{ hosts: string[]; from: EdgeView['hostsFrom'] }> {
  if (shield?.hosts?.length) return { hosts: [...shield.hosts], from: 'connection' };
  const staging = await deps.resolver.value('system.stagingHost');
  return staging ? { hosts: [staging.toLowerCase()], from: 'staging' } : { hosts: [], from: 'none' };
}

export function planOf(s: EdgeShieldSettings, hosts: readonly string[]): ShieldPlan {
  return {
    hosts,
    securityLevel: s.securityLevel,
    browserCheck: s.browserCheck,
    sslStrict: s.sslStrict,
    probePaths: s.blockProbes ? s.probePaths : [],
    adminChallenge: s.adminChallenge ? { path: ADMIN_LOGIN } : null,
    adminLoginLimit: s.adminLoginPer10s ? { path: ADMIN_LOGIN_API, per10s: s.adminLoginPer10s } : null,
  };
}

/** The page's data (`security.read`). */
export async function edgeView(deps: EdgeDeps, who: EdgeWho): Promise<EdgeView> {
  const held = await requirePermission(deps.db, who.actor, 'security.read', { storeId: S });
  const s = await deps.resolver.value('edge.shield');
  const l = await link(deps);
  const h = await hostsOf(deps, l.shield);
  const wanted = shieldRules(planOf(s, h.hosts));
  const rules = SHIELD_PHASE_IDS.flatMap((phase) => wanted[phase].map((r) => ({ ref: r.ref!, phase, action: r.action })));
  let state: EdgeView['state'] = { error: null, differences: [] };
  if (l.shield) {
    try {
      state = { error: null, differences: shieldDiff(await l.shield.read(), wanted) };
    } catch (e) {
      state = { error: e instanceof Error ? e.message : String(e), differences: [] };
    }
  }
  const last = await deps.db.auditLog.findFirst({ where: { action: 'edge.shield.apply' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, after: true } });
  const after = (last?.after ?? {}) as { changed?: string[]; mode?: string };
  return {
    cards: { shield: cardOf(s) },
    link: { provider: l.provider, mode: l.mode },
    hosts: h.hosts,
    hostsFrom: h.from,
    rules,
    state,
    lastSent: last ? { at: last.createdAt.toISOString(), changed: after.changed ?? [], mode: after.mode ?? '' } : null,
    canSend: held.has('security.write'),
    owner: who.actor.staffUserId ? await isOwner(deps.db, who.actor.staffUserId) : false,
  };
}

/** Saves the plan (`settings.write`; the sign-in limit by the owner only). Nothing is sent to Cloudflare here. */
export async function saveEdgeCard(deps: EdgeDeps, who: EdgeWho, input: unknown): Promise<EdgeView> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input) || input.key !== 'shield' || !isObj(input.value)) throw new EdgePageError('INVALID_INPUT', 400, ['key', 'value']);
  const v = input.value;
  const before = await deps.resolver.value('edge.shield');
  const card = cardOf(before);
  if (input.version !== undefined && input.version !== card.version) throw new EdgePageError('STALE', 409, ['version'], { version: card.version });
  if (typeof v.probePaths !== 'string') throw new EdgePageError('INVALID_INPUT', 400, ['probePaths']);
  const per = v.adminLoginPer10s;
  if (per !== '' && per !== null && per !== undefined && (typeof per !== 'number' || !Number.isInteger(per) || per < 0)) throw new EdgePageError('INVALID_INPUT', 400, ['adminLoginPer10s']);
  const next = {
    securityLevel: v.securityLevel,
    browserCheck: v.browserCheck,
    sslStrict: v.sslStrict,
    blockProbes: v.blockProbes,
    probePaths: v.probePaths
      .split(/[,\s]+/)
      .map((p) => p.trim())
      .filter(Boolean),
    adminChallenge: v.adminChallenge,
    adminLoginPer10s: typeof per === 'number' && per > 0 ? per : null,
  };
  const ok = edgeShieldSchema.safeParse(next);
  if (!ok.success) throw new EdgePageError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  // refusing people at Cloudflare is the owner's decision (CLAUDE.md rule 6)
  if (ok.data.adminLoginPer10s !== before.adminLoginPer10s && !(who.actor.staffUserId && (await isOwner(deps.db, who.actor.staffUserId)))) throw new EdgePageError('OWNER_ONLY', 403, ['adminLoginPer10s']);
  const changed = (Object.keys(ok.data) as (keyof EdgeShieldSettings)[]).filter((k) => JSON.stringify(ok.data[k]) !== JSON.stringify(before[k]));
  if (changed.length) {
    await deps.resolver.set('edge.shield', ok.data, INSTALLATION, { actorId: who.actor.staffUserId ?? null, reason: 'Settings › Cloudflare protection' });
    await audit(deps.db, who.actor, { storeId: S, action: 'edge.shield.save', entityType: 'Setting', entityId: 'edge.shield', before: { ...before }, after: { ...ok.data, changed } }, who.ctx);
  }
  return edgeView(deps, who);
}

/** Sends the plan to Cloudflare (`security.write`): only the shop's rules, only the phases that differ. */
export async function sendEdge(deps: EdgeDeps, who: EdgeWho): Promise<EdgeView> {
  await requirePermission(deps.db, who.actor, 'security.write', { storeId: S });
  const s = await deps.resolver.value('edge.shield');
  const l = await link(deps);
  if (!l.shield) throw new EdgePageError('SEND_FAILED', 502, ['provider'], { message: `${l.provider} has no protection rules` });
  const h = await hostsOf(deps, l.shield);
  if (!h.hosts.length) throw new EdgePageError('NO_HOST', 400, ['hosts']);
  const r = await l.shield.apply(planOf(s, h.hosts));
  if (!r.ok) throw new EdgePageError('SEND_FAILED', 502, [], { message: r.error });
  await audit(deps.db, who.actor, { storeId: S, action: 'edge.shield.apply', entityType: 'Setting', entityId: 'edge.shield', after: { changed: r.changed, mode: l.mode, hosts: h.hosts } }, who.ctx);
  return edgeView(deps, who);
}
