// S25 · PR 481 (Blueprint C8.1) — the action/motion library: a short catalogue of per-category motions ("jogging",
// "turning", "sitting at a café" …) that the image-to-video engine (PR 482–484) can turn an approved still into. The
// library ships with the starting set from the blueprint's own list, as sample content the owner edits, renames,
// archives or adds to — never a dropdown baked into the code (CLAUDE.md rule 1). `categoryId` is a loose hint only
// (no foreign key, same as ShotRecipe's): null means "every category"; a store may point it at one of its own
// categories once it has them. Nothing here generates anything — that is PR 482–486.
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@extas/db/client';
import { audit } from '@extas/auth';
import { StudioError } from './errors';
import type { StudioDeps, Who } from './context';

/** The garment hints the starting set covers (Blueprint C8.1); a store's own actions may use any short key. */
export const MOTION_GARMENT_HINTS = ['tracksuit', 'polo', 'formalShirt', 'panjabi', 'footwear', 'bag', 'other'] as const;
export type MotionGarmentHint = (typeof MOTION_GARMENT_HINTS)[number];

export const motionActionKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-zA-Z0-9]*$/, 'a motion key is camelCase letters and digits only');

// The MotionAction row has one `name` column (its English display name); the Bengali name joins the Bengali
// description inside `spec` so the row keeps the model's single-name shape while the admin screen still reads bilingual.
export const motionActionSpecSchema = z
  .object({
    nameBn: z.string().trim().min(1).max(80),
    garmentHint: z.enum(MOTION_GARMENT_HINTS),
    descriptionEn: z.string().trim().min(1).max(200),
    descriptionBn: z.string().trim().min(1).max(200),
    /** Blueprint C8.1: clips run 4–8 seconds. */
    minSeconds: z.int().min(2).max(20),
    maxSeconds: z.int().min(2).max(20),
    /** Blueprint C8.1: "two or three models jogging together" — produced as cut-together separate clips, never one generated crowd shot. */
    groupClip: z.boolean(),
  })
  .strict()
  .refine((s) => s.minSeconds <= s.maxSeconds, { message: 'minSeconds must not be after maxSeconds' });
export type MotionActionSpec = z.infer<typeof motionActionSpecSchema>;

export const motionActionInput = z
  .object({
    key: motionActionKeySchema,
    name: z.string().trim().min(1).max(80),
    categoryId: z.string().uuid().nullish(),
    spec: motionActionSpecSchema,
  })
  .strict();
export type MotionActionInput = z.infer<typeof motionActionInput>;

export const motionActionPatch = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    categoryId: z.string().uuid().nullish(),
    spec: motionActionSpecSchema.optional(),
  })
  .strict();
export type MotionActionPatch = z.infer<typeof motionActionPatch>;

export interface MotionActionView {
  id: string;
  key: string;
  name: string;
  categoryId: string | null;
  spec: MotionActionSpec;
  sharedWithAllStores: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  key: string;
  name: string;
  categoryId: string | null;
  spec: Prisma.JsonValue;
  sharedWithAllStores: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function view(r: Row): MotionActionView {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    categoryId: r.categoryId,
    spec: r.spec as MotionActionSpec,
    sharedWithAllStores: r.sharedWithAllStores,
    archived: r.archivedAt != null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** The starting set the blueprint names (C8.1), seeded once per store and freely editable afterwards. */
export const DEFAULT_MOTION_ACTIONS: readonly MotionActionInput[] = [
  { key: 'jogging', name: 'Jogging', categoryId: null, spec: { nameBn: 'জগিং', garmentHint: 'tracksuit', descriptionEn: 'A light jog, in place or forward.', descriptionBn: 'হালকা জগিং, জায়গায় বা সামনে।', minSeconds: 4, maxSeconds: 8, groupClip: false } },
  { key: 'stretching', name: 'Stretching', categoryId: null, spec: { nameBn: 'স্ট্রেচিং', garmentHint: 'tracksuit', descriptionEn: 'A warm-up stretch.', descriptionBn: 'ওয়ার্ম-আপ স্ট্রেচ।', minSeconds: 4, maxSeconds: 8, groupClip: false } },
  { key: 'groupWorkout', name: 'Group workout', categoryId: null, spec: { nameBn: 'দলগত ওয়ার্কআউট', garmentHint: 'tracksuit', descriptionEn: 'Two or three models working out together.', descriptionBn: 'দুই-তিনজন একসাথে ওয়ার্কআউট করছে।', minSeconds: 4, maxSeconds: 8, groupClip: true } },
  { key: 'walking', name: 'Walking', categoryId: null, spec: { nameBn: 'হাঁটা', garmentHint: 'polo', descriptionEn: 'A relaxed walk.', descriptionBn: 'স্বাভাবিক হাঁটা।', minSeconds: 4, maxSeconds: 8, groupClip: false } },
  { key: 'turning', name: 'Turning', categoryId: null, spec: { nameBn: 'ঘুরে দাঁড়ানো', garmentHint: 'polo', descriptionEn: 'A slow turn, front to back.', descriptionBn: 'সামনে থেকে পেছনে আস্তে ঘোরা।', minSeconds: 4, maxSeconds: 6, groupClip: false } },
  { key: 'cafeSit', name: 'Sitting at a café', categoryId: null, spec: { nameBn: 'ক্যাফেতে বসা', garmentHint: 'polo', descriptionEn: 'Sitting at a café table.', descriptionBn: 'ক্যাফের টেবিলে বসা।', minSeconds: 4, maxSeconds: 8, groupClip: false } },
  { key: 'officeWalk', name: 'Office walk', categoryId: null, spec: { nameBn: 'অফিসে হাঁটা', garmentHint: 'formalShirt', descriptionEn: 'Walking through an office setting.', descriptionBn: 'অফিসের মধ্যে হাঁটা।', minSeconds: 4, maxSeconds: 8, groupClip: false } },
  { key: 'cuffAdjust', name: 'Adjusting a cuff', categoryId: null, spec: { nameBn: 'কাফ ঠিক করা', garmentHint: 'formalShirt', descriptionEn: 'Adjusting the shirt cuff.', descriptionBn: 'শার্টের কাফ ঠিক করা।', minSeconds: 3, maxSeconds: 6, groupClip: false } },
  { key: 'festiveGreeting', name: 'Festive greeting', categoryId: null, spec: { nameBn: 'উৎসবের শুভেচ্ছা', garmentHint: 'panjabi', descriptionEn: 'A warm festive greeting gesture.', descriptionBn: 'উৎসবের উষ্ণ শুভেচ্ছা।', minSeconds: 4, maxSeconds: 8, groupClip: false } },
  { key: 'footwearWalk', name: 'Walking close-up (feet)', categoryId: null, spec: { nameBn: 'হাঁটার ক্লোজ-আপ (পা)', garmentHint: 'footwear', descriptionEn: 'A close-up of the feet while walking.', descriptionBn: 'হাঁটার সময় পায়ের ক্লোজ-আপ।', minSeconds: 4, maxSeconds: 6, groupClip: false } },
  { key: 'bagSling', name: 'Picked up and slung on the shoulder', categoryId: null, spec: { nameBn: 'তুলে কাঁধে নেওয়া', garmentHint: 'bag', descriptionEn: 'Picking the bag up and slinging it on the shoulder.', descriptionBn: 'ব্যাগ তুলে কাঁধে নেওয়া।', minSeconds: 3, maxSeconds: 6, groupClip: false } },
];

/** Idempotent: inserts a default whose key the store does not have yet, touches nothing already there. */
export async function ensureMotionDefaults(db: PrismaClient, storeId: number): Promise<void> {
  const have = new Set((await db.motionAction.findMany({ where: { storeId }, select: { key: true } })).map((r) => r.key));
  const missing = DEFAULT_MOTION_ACTIONS.filter((a) => !have.has(a.key));
  if (!missing.length) return;
  await db.motionAction.createMany({
    data: missing.map((a) => ({ storeId, key: a.key, name: a.name, categoryId: a.categoryId ?? null, spec: a.spec as unknown as Prisma.InputJsonValue, sharedWithAllStores: true })),
  });
}

/** Every action of the store, newest first, defaults seeded first (idempotent, cheap: one existence check). */
export async function listMotionActions(deps: StudioDeps, storeId: number, opts: { includeArchived?: boolean } = {}): Promise<MotionActionView[]> {
  await ensureMotionDefaults(deps.db, storeId);
  const rows = await deps.db.motionAction.findMany({ where: { storeId, ...(opts.includeArchived ? {} : { archivedAt: null }) }, orderBy: [{ archivedAt: 'asc' }, { createdAt: 'asc' }] });
  return rows.map(view);
}

export async function createMotionAction(deps: StudioDeps, who: Who, input: unknown): Promise<MotionActionView> {
  const ok = motionActionInput.safeParse(input);
  if (!ok.success) throw new StudioError('INVALID_INPUT', 'a motion action needs its key, name and spec', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const d = ok.data;
  const taken = await deps.db.motionAction.findFirst({ where: { storeId: who.storeId, key: d.key } });
  if (taken) throw new StudioError('CONFLICT', `the key "${d.key}" is already used`, ['key']);
  const row = await deps.db.motionAction.create({ data: { storeId: who.storeId, key: d.key, name: d.name, categoryId: d.categoryId ?? null, spec: d.spec as unknown as Prisma.InputJsonValue, sharedWithAllStores: false } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.motion.create', entityType: 'MotionAction', entityId: row.id, after: d }, who.ctx);
  return view(row);
}

export async function updateMotionAction(deps: StudioDeps, who: Who, id: string, patch: unknown): Promise<MotionActionView> {
  const ok = motionActionPatch.safeParse(patch);
  if (!ok.success) throw new StudioError('INVALID_INPUT', 'invalid change', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const before = await deps.db.motionAction.findFirst({ where: { id, storeId: who.storeId } });
  if (!before) throw new StudioError('NOT_FOUND', 'no such motion action');
  const d = ok.data;
  const row = await deps.db.motionAction.update({
    where: { id },
    data: { ...(d.name !== undefined ? { name: d.name } : {}), ...(d.categoryId !== undefined ? { categoryId: d.categoryId } : {}), ...(d.spec !== undefined ? { spec: d.spec as unknown as Prisma.InputJsonValue } : {}) },
  });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.motion.update', entityType: 'MotionAction', entityId: id, before: view(before), after: d }, who.ctx);
  return view(row);
}

export async function setMotionActionArchived(deps: StudioDeps, who: Who, id: string, archived: boolean): Promise<MotionActionView> {
  const before = await deps.db.motionAction.findFirst({ where: { id, storeId: who.storeId } });
  if (!before) throw new StudioError('NOT_FOUND', 'no such motion action');
  const row = await deps.db.motionAction.update({ where: { id }, data: { archivedAt: archived ? (deps.now?.() ?? new Date()) : null } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: archived ? 'studio.motion.archive' : 'studio.motion.restore', entityType: 'MotionAction', entityId: id }, who.ctx);
  return view(row);
}

/** The best-matching action for a garment hint (used by PR 482's "let the system suggest"); null when none fits. */
export function suggestMotionAction(actions: readonly MotionActionView[], garmentHint: MotionGarmentHint): MotionActionView | null {
  return actions.find((a) => !a.archived && a.spec.garmentHint === garmentHint) ?? actions.find((a) => !a.archived && a.spec.garmentHint === 'other') ?? null;
}
