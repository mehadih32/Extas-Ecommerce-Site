// S15 · PR 585 (register "Continuous learning engine — Tirondaj (ads) and Doot (SEO/marketing) are the two power
// agents … Quality gate (no shortcut learning): a tip becomes a skill only after it is checked against the official
// docs or two independent good sources, tested in a sandbox or small live test, and written with its source, date
// and confidence"; CLAUDE.md rule 1 "every AI feature ships off", CN-018 "ask the owner only whether a system
// should exist") — AI › Learning engine at `/admin/ai/learning` (registry version 331).
//
// `ai.learningEngine`:
// - `on`: off as it ships. Every write this PR adds beyond curating a source (proposing a tip, running the
//   quality-gate check, promoting a verified tip into the skill basket — `../admin-ai/learning-engine.ts`'s own
//   `proposeSkill` call, the exact same `AiSkill`/`ai.skill` approval queue PR 321/420 already own — creating or
//   grading a practice task, proposing a paid data tool) refuses with `ENGINE_OFF` while this is off. Adding,
//   enabling or archiving a learning source is never gated by it — curating *where* the two power agents may read
//   from is prep work the owner can do before switching the engine on, the same way the ads-guardrails ceilings
//   (PR 581) are visible and editable while that page's own `on` is off.
// - `minIndependentSources`: the quality gate's own number from the register row itself ("two independent good
//   sources") — how many *distinct* learning sources a tip needs to cite before it counts as checked, when none of
//   them is `official_docs` (a single official-docs citation always counts on its own). 1–5, default 2 (the
//   register row's own figure); the owner may widen or narrow it, never a hardcoded "2" in the gate's own code.
import { z } from 'zod';
import { setting } from './define';

const V585 = 331; // S28's registry-order-flow.ts already took 330 on main; next free

/** The quality gate's own citation-count bound — a technical range for the input, not itself a business number. */
export const MIN_INDEPENDENT_SOURCES_MIN = 1; // hardcode-ok: technical bound
export const MIN_INDEPENDENT_SOURCES_MAX = 5; // hardcode-ok: technical bound

export const learningEngineSchema = z
  .object({
    /** Off: curating sources still works; proposing/verifying/promoting a tip, practice tasks and paid-tool
     * proposals all refuse with `ENGINE_OFF`. */
    on: z.boolean(),
    /** How many distinct sources a tip needs (when none is `official_docs`) before the quality gate lets it be
     * tested at all. The register row's own number ("two independent good sources"). */
    minIndependentSources: z.number().int().min(MIN_INDEPENDENT_SOURCES_MIN).max(MIN_INDEPENDENT_SOURCES_MAX),
  })
  .strict();
export type LearningEngineSettings = z.output<typeof learningEngineSchema>;

export const learningEngineSettings = {
  'ai.learningEngine': setting({
    scope: 'installation',
    schema: learningEngineSchema,
    default: { on: false, minIndependentSources: 2 }, // hardcode-ok: the shipped defaults, the register row's own number
    valueType: 'JSON',
    group: 'ai',
    labelKey: 'ai.learningEngine.label',
    helpKey: 'ai.learningEngine.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 331,
    version: V585,
  }),
};
