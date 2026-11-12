// S24 · PR 474 (Blueprint C7.12 "Model libraries" — "Ladies (4–5 profiles) — each profile carries a styling
// guideline the owner sets (how the model is dressed and posed) so the result matches what sells in this
// market. His call, set once per profile", "Kids — added, but the default for kidswear is ghost mannequin or
// flat-lay, not a child model … several providers restrict generating realistic images of children, results are
// less reliable, and ghost shots of kidswear look clean and are cheaper. A kids model profile can be enabled
// later if the owner wants it", "Hand / wrist / face part-models … treated exactly like a model profile",
// C7.22 item 31; no migration — `studio.photoshoot.modelLibraryAssignments`/`.modelStylingGuideline` read through
// `@extas/settings`'s new `registry-photoshoot-model-library.ts`, registry version 294): the three library-level
// pieces PR 445's own model library (`models.ts`) and PR 469/470's own `recipes.ts` (`RECIPE_MODEL_LIBRARIES`:
// `men`/`ladies`/`kids`/`hand_wrist_face`) left open.
//
// `kind: 'part'` (PR 445's own `MODEL_KINDS`) already names the hand/wrist/face part-model library on its own,
// structurally — C7.12's own "treated exactly like a model profile" sentence about those part-models is already
// true the moment a `StudioModel` row is created with `kind: 'part'`; nothing new is needed for that case, so
// this module only ever reads an owner setting for a FULL-BODY model's own library.
//
// Deliberately never guessed from `ModelRow.gender`/`ageGroup`: both are free text in `models.ts`'s own
// `modelInput` schema, never a fixed vocabulary, so pattern-matching strings such as "Men"/"male"/"ladies" would
// be an invented classification, not a real one. Instead the owner makes one explicit choice per model, the same
// "never invent" discipline every studio engine built so far (PR 444/466/472/473) applies to a missing photo,
// applied here to a missing classification instead: a model with no row in `modelLibraryAssignments` is simply
// unassigned, never defaulted to `men` or any other guess.
import type { RecipeModelLibrary } from './recipes';
import { setting, type PhotoshootDeps } from './context';
import type { ModelRow } from './models';

/** The three libraries the owner ever explicitly assigns a full-body model to. Never `hand_wrist_face` — that
 * one follows `kind: 'part'` automatically and is never an owner choice per model (see module comment above). */
export const ASSIGNABLE_MODEL_LIBRARIES = ['men', 'ladies', 'kids'] as const;
export type AssignableModelLibrary = (typeof ASSIGNABLE_MODEL_LIBRARIES)[number];
export const isAssignableModelLibrary = (v: unknown): v is AssignableModelLibrary =>
  typeof v === 'string' && (ASSIGNABLE_MODEL_LIBRARIES as readonly string[]).includes(v);

/** The real assignment map a store has on file right now — `{}` when the owner has assigned no model yet, since
 * the setting itself ships `null` (never an empty-object guess; `null` and `{}` are kept apart the same way PR
 * 470's own `applyCategoryRecipeOverride` keeps `undefined` and `null` apart for a different reason). */
export async function modelLibraryAssignments(deps: Required<Pick<PhotoshootDeps, 'settings'>>, storeId: number): Promise<Readonly<Record<string, AssignableModelLibrary>>> {
  const raw = await setting(deps, storeId, 'studio.photoshoot.modelLibraryAssignments');
  return raw ?? {};
}

/**
 * Which of C7.12's four named libraries a model actually belongs to, pure once the assignment map is in hand.
 * - `kind: 'part'` is always `hand_wrist_face` — a structural fact of the model row itself, never read from the
 *   setting at all.
 * - a full-body model is whatever the owner explicitly assigned, keyed by its own id; `null` when unassigned.
 */
export function modelLibraryOf(model: Pick<ModelRow, 'id' | 'kind'>, assignments: Readonly<Record<string, string>>): RecipeModelLibrary | null {
  if (model.kind === 'part') return 'hand_wrist_face';
  const assigned = assignments[model.id];
  return assigned && isAssignableModelLibrary(assigned) ? assigned : null;
}

/** The real library a model belongs to today, reading the owner's own assignment through the setting — the one
 * call a later job orchestrator (matching a product's recipe against an actual model) would use. */
export async function effectiveModelLibrary(deps: Required<Pick<PhotoshootDeps, 'settings'>>, storeId: number, model: Pick<ModelRow, 'id' | 'kind'>): Promise<RecipeModelLibrary | null> {
  if (model.kind === 'part') return 'hand_wrist_face';
  const assignments = await modelLibraryAssignments(deps, storeId);
  return modelLibraryOf(model, assignments);
}

// ---- Styling guideline (C7.12: "each profile carries a styling guideline the owner sets … His call, set once
// per profile" — framed for the ladies library, kept generally usable for any full-body profile the owner wants
// a note on, never restricted to `gender === 'ladies'`: the field is the owner's own free text, not a rule the
// code enforces by gender.) ----

/** The real styling-guideline map a store has on file — `{}` when the owner has written none yet (the setting
 * itself ships `null`, the same reasoning as `modelLibraryAssignments` above). */
export async function modelStylingGuidelines(deps: Required<Pick<PhotoshootDeps, 'settings'>>, storeId: number): Promise<Readonly<Record<string, string>>> {
  const raw = await setting(deps, storeId, 'studio.photoshoot.modelStylingGuideline');
  return raw ?? {};
}

/** One model's own styling guideline, pure once the map is in hand — `null` when the owner has not written one. */
export function stylingGuidelineFor(modelId: string, guidelines: Readonly<Record<string, string>>): string | null {
  return guidelines[modelId] ?? null;
}

// ---- Kids model gate (C7.12: "the default for kidswear is ghost mannequin or flat-lay, not a child model …
// several providers restrict generating realistic images of children, results are less reliable, and ghost
// shots of kidswear look clean and are cheaper. A kids model profile can be enabled later if the owner wants
// it.") ----

/**
 * Whether an on-model render may ever use a kids-library model today. Deliberately a TWO-gate check, mirroring
 * the "mandatory for these families" dual-gate shape PR 472 already built for detail re-projection:
 * - `kidsModelEnabled` — the dedicated, off-by-default switch this PR adds (`studio.photoshoot.kidsModelEnabled`),
 *   kept apart from the generic `recipes.ts`/`registry-photoshoot-recipes.ts` override on purpose, since this is
 *   a deliberately separate, affirmative decision (C7.12's own reasons: provider restrictions, reliability, cost);
 * - `recipeModelLibrary === 'kids'` — the owner must ALSO have pointed Kidswear's own recipe at the Kids library
 *   through PR 470's own `studio.photoshoot.recipeOverrides` (PR 469's own default keeps it `null`, no model).
 * Both must be true before a kids on-model job is ever allowed to run; either one being false keeps kidswear on
 * ghost mannequin / flat-lay, C7.12's own stated default.
 */
export function kidsModelAllowed(kidsModelEnabled: boolean, recipeModelLibrary: RecipeModelLibrary | null): boolean {
  return kidsModelEnabled === true && recipeModelLibrary === 'kids';
}
