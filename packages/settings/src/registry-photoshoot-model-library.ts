// S24 · PR 474 (Blueprint C7.12 "Model libraries" — "Ladies (4–5 profiles) — each profile carries a styling
// guideline the owner sets (how the model is dressed and posed) so the result matches what sells in this
// market. His call, set once per profile", "Kids — added, but the default for kidswear is ghost mannequin or
// flat-lay, not a child model … A kids model profile can be enabled later if the owner wants it", C7.22 item 31;
// registry version 304) — the three library-level pieces PR 445's own model library (`StudioModel`) and PR
// 469/470's own `RECIPE_MODEL_LIBRARIES` (`men`/`ladies`/`kids`/`hand_wrist_face`) left open.
//
// `studio.photoshoot.modelLibraryAssignments` and `studio.photoshoot.modelStylingGuideline` are both keyed by a
// real `StudioModel.id` — the owner's own people, already owner data (`owner-data.ts`'s own `item('StudioModel',
// 'people')`) — so both ship `null` (never `{}`) and are flagged `isOwnerData: true`, the same "the owner's own
// data has no default" shape `registry-category.ts`'s own `category.faqOwn` already uses, never a generic
// structural default like PR 470's own `recipeOverrides` (keyed by a fixed family, not a person).
// `studio.photoshoot.kidsModelEnabled` is a plain feature switch, not a person, and ships `false` (CN-018, off by
// default) like every other photoshoot toggle.
import { z } from 'zod';
import { setting } from './define';

const V = 304;

/** The three libraries the owner ever explicitly assigns a full-body model to. `hand_wrist_face` is never one of
 * them: `@extas/photoshoot`'s own `models.ts` already names that case structurally (`kind: 'part'`), never an
 * owner choice per model, so it has no row in this map. */
export const ASSIGNABLE_MODEL_LIBRARIES = ['men', 'ladies', 'kids'] as const;
const assignableModelLibrarySchema = z.enum(ASSIGNABLE_MODEL_LIBRARIES);

/** Which library a full-body model belongs to, keyed by its real `StudioModel.id` — set once per model, the
 * owner's own call (C7.12 "His call, set once per profile"); `null` (not `{}`) is the ship-off default: nobody
 * has assigned a single model to a library yet, and that is a true fact, never a guess. A model with no row here
 * is simply unassigned — `@extas/photoshoot`'s own `modelLibraryOf` never falls back to a default library, the
 * same "never invent" discipline every studio engine applies to a missing photo, applied here to a missing
 * classification instead. */
export const photoshootModelLibraryAssignmentsSchema = z.record(z.string().uuid(), assignableModelLibrarySchema).nullable();
export type PhotoshootModelLibraryAssignments = z.infer<typeof photoshootModelLibraryAssignmentsSchema>;

/** One model's own styling guideline — free text, how the owner wants that profile dressed and posed (C7.12),
 * keyed by its real `StudioModel.id`. `null` is the ship-off default for the same reason as the map above. */
export const photoshootModelStylingGuidelineSchema = z.record(z.string().uuid(), z.string().trim().min(1).max(2000)).nullable();
export type PhotoshootModelStylingGuideline = z.infer<typeof photoshootModelStylingGuidelineSchema>;

/** Off by default (CN-018): a child model never renders until the owner turns this on AND points a recipe's own
 * `modelLibrary` override at `'kids'` (`@extas/photoshoot`'s own `kidsModelAllowed` checks both) — C7.12's own
 * "several providers restrict generating realistic images of children, results are less reliable … A kids model
 * profile can be enabled later if the owner wants it", kept as a dedicated, prominent switch rather than folded
 * into PR 470's own generic `recipeOverrides`, since this decision is deliberately a separate, affirmative one. */
export const PHOTOSHOOT_KIDS_MODEL_ENABLED_DEFAULT = false;

export const photoshootModelLibrarySettings = {
  'studio.photoshoot.modelLibraryAssignments': setting({
    schema: photoshootModelLibraryAssignmentsSchema,
    default: null,
    scope: 'store',
    valueType: 'JSON',
    group: 'marketing',
    isOwnerData: true,
    labelKey: 'studio.photoshoot.modelLibraryAssignments.label',
    helpKey: 'studio.photoshoot.modelLibraryAssignments.help',
    sortOrder: 16,
    version: V,
  }),
  'studio.photoshoot.modelStylingGuideline': setting({
    schema: photoshootModelStylingGuidelineSchema,
    default: null,
    scope: 'store',
    valueType: 'JSON',
    group: 'marketing',
    isOwnerData: true,
    labelKey: 'studio.photoshoot.modelStylingGuideline.label',
    helpKey: 'studio.photoshoot.modelStylingGuideline.help',
    sortOrder: 17,
    version: V,
  }),
  'studio.photoshoot.kidsModelEnabled': setting({
    schema: z.boolean(),
    default: PHOTOSHOOT_KIDS_MODEL_ENABLED_DEFAULT,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.photoshoot.kidsModelEnabled.label',
    helpKey: 'studio.photoshoot.kidsModelEnabled.help',
    sortOrder: 18,
    version: V,
  }),
};
