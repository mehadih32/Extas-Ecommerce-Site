// PR 1221 — the growth agent's approval kind and agent key in a file of their own, so the practice seeder (practice/rows.ts)
// can name them without loading the whole growth agent (growth-agent.ts re-exports both).
export const GROWTH_KIND = 'ads.growth.proposal';
/** The agent's key (Blueprint C10: Tirondaj, the ads specialist). */
export const GROWTH_AGENT = 'tirondaj';
