// S15 · PR 583 (Blueprint C10.2; demo 89b-admin-agents.js "Ask the chief") — জ্ঞানী Gyani as the chief: owner →
// Gyani → the other six (`ensureAgentRows` below wires `AiAgent.reportsToId` itself — the one place `agents.ts`'s
// own header comment names as "not wired there"). Asked a free-text "why" question, the chief routes it to the
// agent whose area it names (an employee code or name wins outright, the same precedence `telegram-routing.ts`'s
// `resolveAgentForCommand` already uses; failing that, the Blueprint C10.1 org-chart area a keyword names; failing
// that, the chief investigates it personally — never a guess dressed up as a finding). The "evidence" gathered is
// real and already in the database (that agent's own open-assignment count and its last work-log line) — never the
// demo's own scripted, invented analysis across orders/ads/stock/delivery, which no job runner in this codebase
// produces yet (CLAUDE.md "never invent a requirement"); a later PR that wires real cross-system signals extends
// `gatherEvidence` here, not a second investigations table.
//
// C10.2's own free/owner split: research, reports, **assigning a fix to the named agent**, reviewing work and a
// warning into an agent's appraisal are all free — nothing here moves money, changes a COD amount, a price or a
// discount, raises an ad budget, blocks anyone or deletes anything, so none of it is routed through PR 317's
// approval queue; the owner-approval list itself stays PR 318's own matrix (`permissions.ts`), reused as-is by the
// chief page, not duplicated here.
//
// A "warning" is logged the same way PR 577's own `giveAgentReward` logs a reward — one more `AiWorkLog` row, this
// time `outcome: 'warning'` — so PR 578's future appraisal reports read rewards and warnings off the one append-only
// table they already read rewards from, never a second log to keep in step.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { Prisma, type PrismaClient } from '@extas/db/client';
import { AI_AGENTS, isAiAgentKey, type AiAgentKey } from './agents';
import { ensureAgentRows } from './control-room';
import { AiError } from './errors';

export interface InvestigationsDeps {
  db: PrismaClient;
}

const OPEN_STATUS = 'open';
const CLOSED_STATUS = 'closed';
const WARNING_OUTCOME = 'warning';
const QUESTION_MAX = 500;
const WHY_MAX = 300;
const TITLE_MAX = 160;

/** The chief itself — the one agent `isChief` marks (C10.1), never a second hardcoded key. */
function chiefKey(): AiAgentKey {
  const found = AI_AGENTS.find((a) => a.isChief);
  return (found?.key ?? 'gyani') as AiAgentKey;
}

/** The Blueprint C10.1 org chart's own areas, as keywords — the one place outside Telegram routing that turns free
 * text into "whose area is this", mirrored from the demo's own `ZA_ROUTE_KW` (the areas, not the made-up answers). */
const AREA_KEYWORDS: readonly { re: RegExp; agent: AiAgentKey }[] = [
  { re: /courier|stock|inventory|address|delivery|zone|warehouse|erp/i, agent: 'bhandari' },
  { re: /\bads?\b|budget|campaign|facebook|\bmeta\b|tiktok|google ads|youtube ads/i, agent: 'tirondaj' },
  { re: /design|layout|\bui\b|\bux\b|screenshot|phone size|colou?r/i, agent: 'shilpi' },
  { re: /checkout|cart|combo|\border\b|price|payment|discount/i, agent: 'sawdagor' },
  { re: /server|backup|audit|security|deploy|\bbug\b|\berror\b|speed|crash/i, agent: 'prohori' },
  { re: /\bseo\b|blog|content|social|\bcrm\b|review/i, agent: 'doot' },
];

export interface RoutedAgent {
  agent: AiAgentKey;
  how: 'code' | 'name' | 'keyword' | 'chief';
}

/** Pure routing: a question to the agent responsible for it, or the chief itself when nothing names an area. */
export function routeInvestigationQuestion(question: string): RoutedAgent {
  const codeMatch = /A360-0([1-8])/i.exec(question);
  if (codeMatch) {
    const found = AI_AGENTS.find((a) => a.code === `A360-0${codeMatch[1]}`);
    if (found) return { agent: found.key, how: 'code' };
  }
  const lower = question.toLowerCase();
  for (const a of AI_AGENTS) {
    if (lower.includes(a.nameEn.toLowerCase()) || question.includes(a.nameBn)) return { agent: a.key, how: 'name' };
  }
  for (const k of AREA_KEYWORDS) {
    if (k.re.test(question)) return { agent: k.agent, how: 'keyword' };
  }
  return { agent: chiefKey(), how: 'chief' };
}

export interface InvestigationEvidenceItem {
  label: string;
  detail: string;
}

export interface InvestigationView {
  id: string;
  question: string;
  status: string;
  responsibleAgent: AiAgentKey | null;
  how: string | null;
  findings: string | null;
  evidence: InvestigationEvidenceItem[];
  assignmentId: string | null;
  closedAt: string | null;
  createdAt: string;
}

interface InvestigationRow {
  id: string;
  question: string;
  status: string;
  findings: Prisma.JsonValue;
  evidence: Prisma.JsonValue;
  responsibleAgent: string | null;
  assignmentId: string | null;
  closedAt: Date | null;
  createdAt: Date;
}

function toView(row: InvestigationRow): InvestigationView {
  const findingsObj = row.findings as { summary?: string; how?: string } | null;
  const evidenceArr = Array.isArray(row.evidence) ? (row.evidence as unknown as InvestigationEvidenceItem[]) : [];
  return {
    id: row.id,
    question: row.question,
    status: row.status,
    responsibleAgent: row.responsibleAgent && isAiAgentKey(row.responsibleAgent) ? row.responsibleAgent : null,
    how: findingsObj?.how ?? null,
    findings: findingsObj && typeof findingsObj.summary === 'string' ? findingsObj.summary : null,
    evidence: evidenceArr,
    assignmentId: row.assignmentId,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Real, already-stored evidence for the agent the question was routed to — counts and the last line of its own
 * work log, never a cross-system figure this codebase has not actually measured. */
async function gatherEvidence(db: PrismaClient, agentKey: AiAgentKey): Promise<{ evidence: InvestigationEvidenceItem[]; agentId: string | null }> {
  const row = await db.aiAgent.findUnique({ where: { key: agentKey } });
  if (!row) return { evidence: [], agentId: null };
  const [openCount, lastWork] = await Promise.all([
    db.aiAgentAssignment.count({ where: { agentId: row.id, status: { not: 'done' } } }),
    db.aiWorkLog.findFirst({ where: { agentId: row.id }, orderBy: { createdAt: 'desc' } }),
  ]);
  const evidence: InvestigationEvidenceItem[] = [{ label: `${row.nameEn}'s open assignments`, detail: String(openCount) }];
  if (lastWork) evidence.push({ label: `${row.nameEn}'s last work-log entry`, detail: `${lastWork.summary} (${lastWork.createdAt.toISOString().slice(0, 10)})` });
  return { evidence, agentId: row.id };
}

/** Asks the chief a question (C10.2, the dashboard's own "Ask the chief"). Routes it, gathers real evidence, and —
 * only when a real, non-chief agent was named or matched — assigns the fix to that agent (`source:
 * 'chief-investigation'`, free per C10.2). Always creates an open investigation; never throws on "nothing matched"
 * — the chief investigating it personally is itself an honest answer. */
export async function askTheChief(
  deps: InvestigationsDeps,
  who: { actor: Actor; ctx?: RequestContext },
  input: { question: string; storeId?: number | null },
): Promise<InvestigationView> {
  const question = input.question.trim();
  if (!question || question.length > QUESTION_MAX) throw new AiError(422, 'INVALID_INPUT', ['question']);
  await ensureAgentRows(deps.db);

  const routed = routeInvestigationQuestion(question);
  const chief = chiefKey();
  let evidence: InvestigationEvidenceItem[] = [];
  let agentId: string | null = null;
  if (routed.agent !== chief) {
    const g = await gatherEvidence(deps.db, routed.agent);
    evidence = g.evidence;
    agentId = g.agentId;
  } else {
    evidence = [{ label: 'Area match', detail: 'No employee code, name or area keyword in the question — the chief is reviewing it personally.' }];
  }

  const howText = routed.how === 'code' ? 'the employee code named in the question' : routed.how === 'name' ? 'the agent named in the question' : routed.how === 'keyword' ? 'the area the question describes' : 'no specific area';
  const summary = routed.agent === chief ? `No agent or area matched this question; ${chief} is investigating it directly.` : `Routed to ${routed.agent} based on ${howText}.`;
  const title = question.length > TITLE_MAX ? `${question.slice(0, TITLE_MAX - 1)}…` : question;

  return deps.db.$transaction(async (tx: Prisma.TransactionClient) => {
    let assignmentId: string | null = null;
    if (agentId) {
      const created = await tx.aiAgentAssignment.create({
        data: { agentId, title, description: `Chief's investigation: ${question}`, source: 'chief-investigation', assignedById: who.actor.staffUserId ?? null, status: 'todo' },
      });
      assignmentId = created.id;
    }
    const investigation = await tx.aiInvestigation.create({
      data: {
        storeId: input.storeId ?? null,
        question,
        askedVia: 'dashboard',
        status: OPEN_STATUS,
        findings: { summary, how: routed.how } satisfies Prisma.InputJsonObject,
        evidence: evidence as unknown as Prisma.InputJsonArray,
        responsibleAgent: routed.agent,
        assignmentId,
      },
    });
    await audit(
      tx,
      who.actor,
      { action: 'ai.chief.ask', entityType: 'AiInvestigation', entityId: investigation.id, before: {}, after: { question, responsibleAgent: routed.agent, assignmentId } },
      who.ctx ?? {},
    );
    return toView(investigation);
  });
}

/** The chief tab's own "Open investigations" list, newest first. */
export async function listInvestigations(deps: InvestigationsDeps, input?: { status?: string; take?: number }): Promise<InvestigationView[]> {
  const rows = await deps.db.aiInvestigation.findMany({
    where: input?.status ? { status: input.status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: input?.take ?? 20,
  });
  return rows.map(toView);
}

/** Closes an investigation (C10.2's own review step). A no-op, not an error, on an already-closed one — the same
 * double-tap rule every other AI 360 setter in this folder follows. */
export async function closeInvestigation(deps: InvestigationsDeps, who: { actor: Actor; ctx?: RequestContext }, id: string): Promise<void> {
  await deps.db.$transaction(async (tx: Prisma.TransactionClient) => {
    const row = await tx.aiInvestigation.findUnique({ where: { id } });
    if (!row) throw new AiError(404, 'NOT_FOUND', ['id']);
    if (row.status === CLOSED_STATUS) return;
    await tx.aiInvestigation.update({ where: { id }, data: { status: CLOSED_STATUS, closedAt: new Date() } });
    await audit(tx, who.actor, { action: 'ai.chief.close', entityType: 'AiInvestigation', entityId: id, before: { status: row.status }, after: { status: CLOSED_STATUS } }, who.ctx ?? {});
  });
}

export interface AgentWarning {
  id: string;
  why: string;
  at: string;
}

/** A warning into an agent's appraisal (C10.2's own "free to do"; PR 578 reads it off the same `AiWorkLog` table
 * `giveAgentReward` already writes rewards to). Always a new row — a warning is never merged into an earlier one. */
export async function warnAgent(
  deps: InvestigationsDeps,
  who: { actor: Actor; ctx?: RequestContext },
  agentKey: string,
  input: { why: string; investigationId?: string | null },
): Promise<AgentWarning> {
  if (!isAiAgentKey(agentKey)) throw new AiError(404, 'NOT_FOUND', ['agentKey']);
  const why = input.why.trim();
  if (!why || why.length > WHY_MAX) throw new AiError(422, 'INVALID_INPUT', ['why']);
  const row = await deps.db.aiAgent.findUnique({ where: { key: agentKey } });
  if (!row || row.archivedAt) throw new AiError(404, 'NOT_FOUND', ['agentKey']);
  const created = await deps.db.aiWorkLog.create({
    data: { agentId: row.id, summary: why, outcome: WARNING_OUTCOME, taskRef: input.investigationId ?? null, prRef: null, files: [] },
  });
  await audit(deps.db, who.actor, { action: 'ai.chief.warn', entityType: 'AiAgent', entityId: row.id, before: {}, after: { why, investigationId: input.investigationId ?? null } }, who.ctx ?? {});
  return { id: created.id, why, at: created.createdAt.toISOString() };
}
