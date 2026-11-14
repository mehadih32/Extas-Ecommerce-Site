// S28 · PR 713 (CN-048, admin prototype v5, AI Center › Training) — the limits of what the owner may write on the Training page and how
// many versions its history shows. The instructions and forbidden topics themselves are rows of `AiTrainingExample` (S15 · PR 323, no
// migration), never a setting: a row is archived, not edited, so the history of every version is kept (apps/web/src/lib/admin-ai/
// training-instructions.ts). Nothing here runs an agent: no agent runs until `ai.enabled`, and nothing is ever sent to a buyer.
//
// `ai.trainingPage`: how many versions the history shows (every version is kept either way).
import { z } from 'zod';
import { setting } from './define';

const V713 = 713; // the register PR number

/** Technical bounds for what one write may hold: they stop a save from becoming a book, they are not a business rule. */
export const TRAINING_TEXT_MAX = 600; // hardcode-ok: technical bound
export const TRAINING_PER_AGENT_MAX = 30; // hardcode-ok: technical bound
export const TRAINING_FORBIDDEN_MAX = 40; // hardcode-ok: technical bound
export const TRAINING_FORBIDDEN_TEXT_MAX = 120; // hardcode-ok: technical bound
export const TRAINING_SAMPLE_MAX = 300; // hardcode-ok: technical bound (the one question the AI call layer takes)
export const TRAINING_ANSWER_MAX = 1000; // hardcode-ok: technical bound
export const TRAINING_DOC_TITLE_MAX = 120; // hardcode-ok: technical bound
export const TRAINING_DOC_TEXT_MAX = 3000; // hardcode-ok: technical bound
export const TRAINING_DOCS_MAX = 40; // hardcode-ok: technical bound
export const TRAINING_NOTE_MAX = 1000; // hardcode-ok: technical bound
/** The key that means "every agent". */
export const TRAINING_ALL = 'all';

export const aiTrainingPageSchema = z.object({ versionRows: z.int().min(5).max(100) }).strict();
export type AiTrainingPageSettings = z.output<typeof aiTrainingPageSchema>;

export const aiTrainingSettings = {
  'ai.trainingPage': setting({
    scope: 'installation',
    schema: aiTrainingPageSchema,
    default: { versionRows: 10 }, // hardcode-ok: how many versions the history shows
    valueType: 'JSON',
    group: 'ai',
    labelKey: 'ai.trainingPage.label',
    helpKey: 'ai.trainingPage.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 713,
    version: V713,
  }),
};
