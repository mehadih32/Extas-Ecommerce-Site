// S15 · PR 304, 577, 581 (A4.3, C1.1, C10) — the seven fixed EXTAS agents, as code: who they are and what each is
// for (docs/agents/<name>.md). Like the permission catalogue (packages/auth/src/catalogue.ts), this is structural
// identity, never an owner's own text or number, so it ships the same on every installation (CLAUDE.md rule 4).
// Whether an agent runs, its monthly cap, its schedule and its model pick are the owner's own choice, kept on its
// AiAgent row (PR 305, 307, 308, 309) — off, empty or the practice writer until he sets them. Tirondaj is the
// seventh, ads-only agent (PR 581). Gyani is the chief (`isChief`, PR 583); the reporting chain itself
// (`AiAgent.reportsToId`) is wired by PR 583, not here.
export interface AiAgentDef {
  key: string;
  /** Employee code (docs/agents/<name>.md), e.g. A360-01. */
  code: string;
  nameEn: string;
  nameBn: string;
  role: string;
  /** A plain-text avatar until a real photo is set (AiAgent.photoAssetRef, not built yet). */
  emoji: string;
  isChief: boolean;
}

export const AI_AGENTS = [
  { key: 'gyani', code: 'A360-01', nameEn: 'Gyani', nameBn: 'জ্ঞানী', role: 'Chief agent: investigates any "why", names the responsible agent, assigns the fix and reports back. Fraud, Smart Rules, AI 360, finance, support, studio, video.', emoji: '🧠', isChief: true },
  { key: 'prohori', code: 'A360-02', nameEn: 'Prohori', nameBn: 'প্রহরী', role: 'Server, settings framework, security, deploy, backup, site health & audit.', emoji: '🛡️', isChief: false },
  { key: 'bhandari', code: 'A360-03', nameEn: 'Bhandari', nameBn: 'ভান্ডারী', role: 'Catalogue and images, courier, returns and exchange, ERP sync, documents.', emoji: '📦', isChief: false },
  { key: 'sawdagor', code: 'A360-04', nameEn: 'Sawdagor', nameBn: 'সওদাগর', role: 'The storefront logic: pages, combos, cart, checkout, orders, payments.', emoji: '🛍️', isChief: false },
  { key: 'shilpi', code: 'A360-05', nameEn: 'Shilpi', nameBn: 'শিল্পী', role: 'Senior UI/UX. Every customer-facing surface, phone first; reviews what Sawdagor builds.', emoji: '🎨', isChief: false },
  { key: 'doot', code: 'A360-06', nameEn: 'Doot', nameBn: 'দূত', role: 'SEO, content, non-paid marketing, CRM, social, and the analytics that feed them.', emoji: '📣', isChief: false },
  { key: 'tirondaj', code: 'A360-07', nameEn: 'Tirondaj', nameBn: 'তীরন্দাজ', role: "Paid ads only — Google, Meta, TikTok — inside the owner's guardrails; asks before spending more.", emoji: '🏹', isChief: false },
] as const satisfies readonly AiAgentDef[];

export type AiAgentKey = (typeof AI_AGENTS)[number]['key'];

export const AI_AGENT_KEYS: readonly AiAgentKey[] = AI_AGENTS.map((a) => a.key);

export function isAiAgentKey(key: string): key is AiAgentKey {
  return (AI_AGENT_KEYS as readonly string[]).includes(key);
}

export function aiAgentDef(key: AiAgentKey): AiAgentDef {
  const found = AI_AGENTS.find((a) => a.key === key);
  if (!found) throw new Error(`unknown AI agent key: ${key}`);
  return found;
}
