// S24 · PR 448 (Blueprint C7.22 item 5; C7.4's required set; built on PR 444's `listReferenceRoles`, which was kept
// exactly for this). Reference analysis and recommendation: given the real reference photos a staff member has
// already tagged for a product (`tagReferenceRole`, PR 444), this says what each engine already has enough of, what
// C7.4's required set (front, back, one detail/fabric close-up) is still missing, and — in plain words — exactly
// which photo to take next (the same "ask, don't fail" pattern as C7.10's Detail Finder). No generation happens
// here; this only ever reads, so it needs no new data model (C7.6: "mapped onto the existing schema rather than
// duplicating the product and media tables").
import { z } from 'zod';
import { allow, checkStoreId, parse, type PhotoshootDeps, type Who } from './context';
import { listReferenceRoles, type AssetRow } from './assets';
import { missingReferenceRoles, REFERENCE_ROLES, type AssetRole } from './roles';
import { planGhostMannequinViews, type GhostMannequinPlanItem } from './ghostMannequin';

/** C7.4's required set per product: front, back, one detail/fabric close-up. (A print/label shot is "any" — conditional, not required.) */
export const REQUIRED_REFERENCE_ROLES = ['front_reference', 'back_reference', 'detail_reference'] as const satisfies readonly AssetRole[];

export interface ReferenceAssetLike {
  role: string | null;
  isOriginal: boolean;
  archivedAt?: Date | string | null;
}

export interface ReferenceRoleStatus {
  role: AssetRole;
  required: boolean;
  present: boolean;
}

export interface ReferenceRecommendation {
  roles: ReferenceRoleStatus[];
  missing: AssetRole[];
  ready: boolean;
  ghostMannequin: GhostMannequinPlanItem[];
  /** One plain line per missing role, ready to show the owner — never a hard failure. */
  asks: string[];
}

const ASK_LINES: Partial<Record<AssetRole, string>> = {
  front_reference: 'Take one front photo of the garment (flat-lay or on a mannequin) — nothing can be generated without it.',
  back_reference: 'Take one real back photo — C7.6: a back view is never invented without a real back reference on file.',
  detail_reference: 'Take one close-up of a fabric, logo, print or label, so the detail step has something real to work from.',
};

/** Pure: given the roles already on file, what each engine has enough of, what C7.4's required set still misses, and what to ask for next. */
export function analyzeReferenceCoverage(assets: readonly ReferenceAssetLike[], wanted: readonly AssetRole[] = REQUIRED_REFERENCE_ROLES): ReferenceRecommendation {
  const live = (r: AssetRole) => assets.some((a) => a.isOriginal && a.role === r && !a.archivedAt);
  const hasFront = live('front_reference') || assets.some((a) => a.isOriginal && a.role === 'primary_garment' && !a.archivedAt);
  const presentRoles = REFERENCE_ROLES.filter((r) => (r === 'front_reference' ? hasFront : live(r)));
  const missing = missingReferenceRoles(presentRoles, wanted);
  const roles: ReferenceRoleStatus[] = REFERENCE_ROLES.map((role) => ({
    role,
    required: (wanted as readonly AssetRole[]).includes(role),
    present: presentRoles.includes(role),
  }));
  return {
    roles,
    missing,
    ready: missing.length === 0,
    ghostMannequin: planGhostMannequinViews(assets),
    asks: missing.map((r) => ASK_LINES[r] ?? `Take one more ${r.replace('_reference', '')} photo.`),
  };
}

const recommendInput = z
  .object({
    assetIds: z.array(z.string().uuid()).min(1).max(200),
  })
  .strict();

/**
 * Reads the reference photos already on file for a product (by their asset ids) and recommends what is ready and
 * what to shoot next. Read-only; never writes, never generates. An id that is missing, archived or belongs to
 * another store is simply not counted (`listReferenceRoles`'s own store scoping, PR 444).
 */
export async function recommendReferences(deps: Pick<PhotoshootDeps, 'db'>, who: Who, input: unknown): Promise<ReferenceRecommendation> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const d = parse(recommendInput, input, 'reference analysis request');
  const rows: AssetRow[] = await listReferenceRoles(deps, who, d.assetIds);
  return analyzeReferenceCoverage(rows);
}
