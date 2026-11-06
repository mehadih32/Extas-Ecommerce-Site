// S19 · PR 652 (CN-036, owner 6 Nov 2026; updated 6 Nov 14:55 Dhaka) — the closed stages hidden by a switch (registry
// version 235). Labels: messages/closed-stages.<lang>.json (group `admin`).
//
// - `stages.closedShown`: one switch per stage the owner has closed until he says so — S15 AI control room, S17
//   multi-store, S23 social studio, S24 virtual photoshoot, S25 video campaign, S26, S27 handover pack. Off (hidden) as
//   shipped: every half-built part of a closed stage is out of the admin menu, the admin search, the shop's sitemap,
//   its search and robots (apps/web/src/lib/stages/closed.ts lists the parts). Built parts are kept, nothing is
//   deleted; a stage's switch is turned on when the stage is finished. With S15 off, the AI Center section and the
//   round assistant button are not shown.
// Nothing here moves money, changes a price or blocks anyone: it only shows or hides finished-later parts.
import { z } from 'zod';
import { setting } from './define';

const V = 235;

/** The stages closed by the owner (CN-036), in register order. */
export const CLOSED_STAGES = ['S15', 'S17', 'S23', 'S24', 'S25', 'S26', 'S27'] as const;
export type ClosedStage = (typeof CLOSED_STAGES)[number];

export const closedStagesShownSchema = z.object(Object.fromEntries(CLOSED_STAGES.map((s) => [s, z.boolean()])) as Record<ClosedStage, z.ZodBoolean>).strict();
export type ClosedStagesShown = z.infer<typeof closedStagesShownSchema>;

export const CLOSED_STAGES_SHOWN_DEFAULT = Object.fromEntries(CLOSED_STAGES.map((s) => [s, false])) as ClosedStagesShown;

export const closedStageSettings = {
  'stages.closedShown': setting({
    schema: closedStagesShownSchema,
    default: CLOSED_STAGES_SHOWN_DEFAULT,
    scope: 'installation',
    valueType: 'JSON',
    group: 'admin',
    isOwnerData: false,
    isPublic: false,
    labelKey: 'stages.closedShown.label',
    helpKey: 'stages.closedShown.help',
    sortOrder: 90,
    version: V,
  }),
};
