// S28 · PR 685 — the add-product wizard's memory: where a draft stopped, and the plain facts that say which steps are
// done. Reading needs `catalogue.read`, remembering a step needs `catalogue.write` (audited). Nothing here changes the
// product itself: the wizard walks the product screen one part at a time and every save is that screen's own save.
import { CatalogueError } from './errors';
import { allow, found, type CatalogueDeps, type Who } from './context';
import { advanceDraftState, firstOpenStep, readDraftState, stepDone, WIZARD_STEPS, type WizardDraftState, type WizardFacts } from './wizard-pick';

export {
  WIZARD_STEPS,
  WIZARD_PARTS,
  WIZARD_KEYS,
  parseWizardStep,
  wizardKey,
  stepDone,
  firstOpenStep,
  readDraftState,
  advanceDraftState,
  type WizardDraftState,
  type WizardFacts,
  type WizardStepKey,
} from './wizard-pick';

export interface WizardView {
  productId: string;
  /** The last step opened (2-8), null when the wizard was never opened on this draft. */
  state: WizardDraftState | null;
  facts: WizardFacts;
  /** For each step 2-8: done or not. */
  done: boolean[];
  /** The step to open when the person comes back. */
  resumeStep: number;
}

export interface WizardDraftRow {
  productId: string;
  nameEn: string | null;
  step: number;
  furthest: number;
  at: string;
}

async function facts(deps: CatalogueDeps, who: Who, productId: string): Promise<{ facts: WizardFacts; state: unknown }> {
  const p = found(
    await deps.db.product.findFirst({
      where: { id: productId, storeId: who.storeId },
      select: { nameEn: true, categoryId: true, draftState: true },
    }),
    'product',
  );
  const [colours, variants, photos] = await Promise.all([
    deps.db.productColour.count({
      where: { storeId: who.storeId, productId, archivedAt: null },
    }),
    deps.db.productVariant.findMany({
      where: { storeId: who.storeId, productId, archivedAt: null },
      select: { sizeId: true, priceMinor: true },
    }),
    deps.db.productMedia.count({
      where: { storeId: who.storeId, productId, archivedAt: null },
    }),
  ]);
  return {
    state: p.draftState,
    facts: {
      hasName: !!p.nameEn && p.nameEn.trim().length > 0,
      hasCategory: !!p.categoryId,
      colours,
      sizes: new Set(variants.map((v) => v.sizeId).filter(Boolean)).size,
      photos,
      variants: variants.length,
      pricedVariants: variants.filter((v) => (v.priceMinor ?? 0) > 0).length,
    },
  };
}

export async function wizardView(deps: CatalogueDeps, who: Who, productId: string): Promise<WizardView> {
  await allow(deps, who, 'catalogue.read');
  const r = await facts(deps, who, productId);
  const state = readDraftState(r.state);
  const done = Array.from({ length: WIZARD_STEPS - 1 }, (_, i) => stepDone(i + 2, r.facts));
  return {
    productId,
    state,
    facts: r.facts,
    done,
    resumeStep: state?.step ?? firstOpenStep(r.facts),
  };
}

/** Remembers that the person opened `step` on this draft (so "continue where I stopped" works). */
export async function rememberWizardStep(deps: CatalogueDeps, who: Who, productId: string, step: unknown): Promise<WizardDraftState> {
  await allow(deps, who, 'catalogue.write');
  if (typeof step !== 'number' || !Number.isInteger(step) || step < 2 || step > WIZARD_STEPS)
    throw new CatalogueError('INVALID_INPUT', 'step must be 2-8', ['step']);
  const p = found(
    await deps.db.product.findFirst({
      where: { id: productId, storeId: who.storeId },
      select: { id: true, status: true, draftState: true },
    }),
    'product',
  );
  if (p.status !== 'DRAFT' && p.status !== 'READY_TO_PUBLISH') throw new CatalogueError('CONFLICT', 'only a draft has wizard steps', ['NOT_A_DRAFT']);
  const next = advanceDraftState(p.draftState, step, deps.now?.() ?? new Date());
  await deps.db.product.update({
    where: { id: productId },
    data: { draftState: next as unknown as object },
  });
  return next;
}

/** The drafts the wizard can continue, the newest first (a draft whose wizard was opened and that is still a draft). */
export async function wizardDrafts(deps: CatalogueDeps, who: Who, limit = 20): Promise<WizardDraftRow[]> { // hardcode-ok: a page of drafts, not a business rule
  await allow(deps, who, 'catalogue.read');
  const rows = await deps.db.product.findMany({
    where: {
      storeId: who.storeId,
      status: 'DRAFT',
      archivedAt: null,
      isDemo: false,
    },
    select: { id: true, nameEn: true, draftState: true },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });
  const out: WizardDraftRow[] = [];
  for (const r of rows) {
    const s = readDraftState(r.draftState);
    if (s && out.length < Math.min(Math.max(Math.trunc(limit), 1), 50))
      out.push({
        productId: r.id,
        nameEn: r.nameEn,
        step: s.step,
        furthest: s.furthest,
        at: s.at,
      });
  }
  return out;
}
