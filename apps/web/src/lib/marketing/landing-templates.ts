// S13 · PR 255 (Blueprint MKT-05, demo 84-admin-landing.js "Choose a template", 01-data.js DB.landingTemplates) —
// Marketing › Landing pages › Templates: the ready-made templates, the owner's own and the parts library.
//
// - The four ready-made templates ship with the code (landing-model.ts BUILT_IN_TEMPLATES): which parts are on, no words.
//   The owner's own templates are LandingTemplate rows: a name, a key `own-<name>` and the parts' switches and words,
//   saved from the builder ("Save as a template"). Archive and restore change their state only — nothing is deleted, and
//   a page made from a template keeps its own copy of the parts.
// - A new page may start from a ready-made template or an own one that is not archived; the page keeps the key
//   (Page.templateKey), so the list counts how many pages each template started.
// - Seeing needs `marketing.landing.read`; saving, archiving and restoring need `marketing.landing.write` and are
//   audited (marketing.landing.template.create / .archive / .restore). Nothing here writes a price, a discount or an
//   order.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { BUILT_IN_TEMPLATES, builtInSections, isBuiltInTemplate, ownTemplateKey, templateData, templateInputSchema, templateSectionsOf, type BuiltInTemplate, type LandingSection } from './landing-model';

const S = MOTHER_STORE_ID;
/** How many own templates the page lists (newest first). */
export const TEMPLATE_LIST_MAX = 200; // hardcode-ok: a list length, not a business number

export class TemplateError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

type Db = PrismaClient;
export interface TemplateWho {
  actor: Actor;
  ctx: RequestContext;
}

export interface BuiltInRow {
  key: BuiltInTemplate;
  sections: LandingSection[];
  uses: number;
}
export interface OwnRow {
  id: string;
  key: string;
  name: string;
  sections: LandingSection[];
  archived: boolean;
  uses: number;
  version: string;
}
export interface TemplateList {
  builtIn: BuiltInRow[];
  own: OwnRow[];
}

/** What the builder offers a new page: every ready-made template and the own ones not archived. */
export interface TemplateChoice {
  key: string;
  /** null for a ready-made one (its name is in the messages files). */
  name: string | null;
  sections: LandingSection[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function usesOf(db: Db, storeId: number): Promise<Map<string, number>> {
  const rows = await db.page.groupBy({ by: ['templateKey'], where: { storeId, kind: 'LANDING', templateKey: { not: null }, archivedAt: null }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.templateKey ?? '', r._count._all]));
}

/** The ready-made templates and the owner's own (archived ones too, marked), with how many live pages each started. */
export async function templateList(db: Db, storeId: number = S): Promise<TemplateList> {
  const [rows, uses] = await Promise.all([
    db.landingTemplate.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: TEMPLATE_LIST_MAX, select: { id: true, key: true, name: true, sections: true, archivedAt: true, updatedAt: true } }),
    usesOf(db, storeId),
  ]);
  return {
    builtIn: BUILT_IN_TEMPLATES.map((key) => ({ key, sections: builtInSections(key), uses: uses.get(key) ?? 0 })),
    own: rows
      .filter((r) => !isBuiltInTemplate(r.key))
      .map((r) => ({ id: r.id, key: r.key, name: r.name, sections: templateSectionsOf(r.sections), archived: !!r.archivedAt, uses: uses.get(r.key) ?? 0, version: r.updatedAt.toISOString() })),
  };
}

/** The builder's choices for a new page. */
export async function templateChoices(db: Db, storeId: number = S): Promise<TemplateChoice[]> {
  const l = await templateList(db, storeId);
  return [...l.builtIn.map((t) => ({ key: t.key, name: null, sections: t.sections })), ...l.own.filter((t) => !t.archived).map((t) => ({ key: t.key, name: t.name, sections: t.sections }))];
}

/** Whether a new page may start from this key: a ready-made template, or an own one of this store not archived. */
export async function templateUsable(db: Db, key: string, storeId: number = S): Promise<boolean> {
  if (isBuiltInTemplate(key)) return true;
  return !!(await db.landingTemplate.findFirst({ where: { storeId, key, archivedAt: null }, select: { id: true } }));
}

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Save the builder's parts as an own template under a name (its key made from the name, never a ready-made one). */
export async function createTemplate(db: Db, who: TemplateWho, input: unknown, storeId: number = S): Promise<OwnRow> {
  const ok = templateInputSchema.safeParse(input);
  if (!ok.success) throw new TemplateError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const d = ok.data;
  const taken = await db.landingTemplate.findMany({ where: { storeId, key: { startsWith: 'own-' } }, select: { key: true, name: true, archivedAt: true } });
  if (taken.some((r) => !r.archivedAt && r.name.trim().toLowerCase() === d.name.toLowerCase())) throw new TemplateError('NAME_TAKEN', 409, ['name']);
  const key = ownTemplateKey(d.name, new Set(taken.map((r) => r.key)));
  let row: { id: string };
  try {
    row = await db.landingTemplate.create({ data: { storeId, key, name: d.name, sections: templateData(d.sections) as Prisma.InputJsonValue }, select: { id: true } });
  } catch (e) {
    if (isUnique(e)) throw new TemplateError('NAME_TAKEN', 409, ['name']);
    throw e;
  }
  const after = (await templateList(db, storeId)).own.find((r) => r.id === row.id)!;
  await audit(db, who.actor, { storeId, action: 'marketing.landing.template.create', entityType: 'LandingTemplate', entityId: row.id, after: { key, name: d.name } }, who.ctx);
  return after;
}

/** Archive or restore an own template at the version it was read at. */
export async function templateAction(db: Db, who: TemplateWho, id: string, input: unknown, now: Date = new Date(), storeId: number = S): Promise<OwnRow> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const action = o.action === 'archive' || o.action === 'restore' ? o.action : null;
  if (!action) throw new TemplateError('INVALID_INPUT', 400, ['action']);
  const before = UUID.test(id) ? await db.landingTemplate.findFirst({ where: { id, storeId }, select: { id: true, key: true, name: true, archivedAt: true, updatedAt: true } }) : null;
  if (!before || isBuiltInTemplate(before.key)) throw new TemplateError('NOT_FOUND', 404);
  if (before.updatedAt.toISOString() !== o.version) throw new TemplateError('STALE', 409);
  if ((action === 'archive') === !!before.archivedAt) throw new TemplateError('WRONG_STATE', 409);
  if (action === 'restore') {
    const clash = await db.landingTemplate.findFirst({ where: { storeId, archivedAt: null, name: { equals: before.name, mode: 'insensitive' }, id: { not: id } }, select: { id: true } });
    if (clash) throw new TemplateError('NAME_TAKEN', 409, ['name']);
  }
  await db.landingTemplate.update({ where: { id }, data: { archivedAt: action === 'archive' ? now : null } });
  const after = (await templateList(db, storeId)).own.find((r) => r.id === id)!;
  await audit(db, who.actor, { storeId, action: `marketing.landing.template.${action}`, entityType: 'LandingTemplate', entityId: id, before: { archived: !!before.archivedAt }, after: { archived: after.archived } }, who.ctx);
  return after;
}

const answer = (e: unknown): Response => (e instanceof TemplateError ? json({ ok: false, error: e.code, ...(e.details ? { details: e.details } : {}) }, { status: e.status }) : errorResponse(e));

/**
 * /api/admin/marketing/landing-templates[/<id>] — GET the list (`marketing.landing.read`); POST {name, sections} saves
 * an own template; POST {action: archive | restore, version} on one (`marketing.landing.write`).
 */
export async function landingTemplatesHandler(request: Request, deps: AdminDeps | null, id: string | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  if (id && method === 'GET') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.landing.read' : 'marketing.landing.write', storeId: S });
  if (g instanceof Response) return g;
  const db = deps!.db;
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') return json({ ok: true, list: await templateList(db) });
    if (!id) return json({ ok: true, template: await createTemplate(db, who, await body(request)) }, { status: 201 });
    return json({ ok: true, template: await templateAction(db, who, id, await body(request)) });
  } catch (e) {
    return answer(e);
  }
}
