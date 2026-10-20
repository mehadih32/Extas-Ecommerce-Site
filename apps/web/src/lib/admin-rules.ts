// S10 · PR 208–219 — what the Smart Rules pages read on the server before they draw: the rules services as the
// signed-in person in the mother store (the same checks the API makes), the store's text context and limits for the
// editor's live preview, and the names the cards and chips show.
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { PermissionKey } from '@extas/auth';
import * as rl from '@extas/rules';
import type { WindowedParams } from '@extas/rules/pure';
import type { PlaceOption, RulesEnv, ScopeOption } from '@/components/admin/rules/model';
import type { PageAccess } from './admin-page';
import { rulesDeps } from './rules-api';

type Ok = Extract<PageAccess, { kind: 'ok' }>;

export interface RulesAccess {
  deps: rl.RulesDeps;
  who: rl.Who;
  storeId: number;
  can: (p: PermissionKey) => boolean;
  perms: { write: boolean; publish: boolean; approve: boolean };
}

export function rulesAccess(access: Ok): RulesAccess {
  const storeId = MOTHER_STORE_ID;
  const can = (p: PermissionKey) => access.guard.permissions?.has(p) ?? false;
  return {
    deps: rulesDeps(access.deps),
    who: { actor: access.guard.actor, storeId, ctx: access.guard.ctx },
    storeId,
    can,
    perms: { write: can('rules.write'), publish: can('rules.publish'), approve: can('rules.approve') },
  };
}

/** The editor's text context, limits and the other rules' values (for `{rule-key.param}`), as the server checks them. */
export async function rulesEnv(a: RulesAccess): Promise<RulesEnv> {
  const [ctx, limits, { rules }] = await Promise.all([rl.textContext(a.deps, a.storeId), rl.checkLimits(a.deps, a.storeId), rl.loadRules(a.deps.db, a.storeId)]);
  const others: Record<string, WindowedParams> = {};
  for (const [k, r] of rl.othersByKey(rules)) others[k] = { params: r.params, startsAt: r.startsAt ?? null, endsAt: r.endsAt ?? null };
  return { ctx, limits: { ...limits, placements: [...limits.placements] }, others };
}

/** The store's places (the `rules.placements` setting). */
export async function rulePlaces(a: RulesAccess): Promise<PlaceOption[]> {
  const list = (await a.deps.settings.value('rules.placements', { storeId: a.storeId })) as { key: string; en: string; bn: string }[];
  return list.map((p) => ({ key: p.key, en: p.en, bn: p.bn }));
}

/** What Applies to / Except can name: everything, the store's categories and collections. */
export async function ruleScopes(a: RulesAccess): Promise<ScopeOption[]> {
  const [cats, cols] = await Promise.all([
    a.deps.db.category.findMany({ where: { storeId: a.storeId, archivedAt: null }, select: { id: true, nameEn: true, nameBn: true }, orderBy: { nameEn: 'asc' } }),
    a.deps.db.collection.findMany({ where: { storeId: a.storeId, archivedAt: null }, select: { id: true, nameEn: true, nameBn: true }, orderBy: { nameEn: 'asc' } }),
  ]);
  return [
    { type: 'all', id: null, nameEn: 'all', nameBn: null },
    ...cats.map((c) => ({ type: 'category' as const, id: c.id, nameEn: c.nameEn, nameBn: c.nameBn })),
    ...cols.map((c) => ({ type: 'collection' as const, id: c.id, nameEn: c.nameEn, nameBn: c.nameBn })),
  ];
}

/** The names of the products the rules name in their scope. */
export async function scopeProducts(a: RulesAccess, views: readonly rl.RuleView[]): Promise<Record<string, { nameEn: string; nameBn: string | null }>> {
  const ids = new Set<string>();
  for (const v of views) for (const c of [v.live, v.draft]) for (const x of c ? [...c.scope.include, ...c.scope.exclude] : []) if (x.type === 'product') ids.add(x.id);
  if (!ids.size) return {};
  const rows = await a.deps.db.product.findMany({ where: { storeId: a.storeId, id: { in: [...ids] } }, select: { id: true, nameEn: true, nameBn: true } });
  return Object.fromEntries(rows.map((r) => [r.id, { nameEn: r.nameEn, nameBn: r.nameBn }]));
}

/** Every rule of the store as the editor opens it (archived ones too), in the list's order. */
export async function allRuleViews(a: RulesAccess): Promise<rl.RuleView[]> {
  const { rules } = await rl.listRules(a.deps, a.who, { includeArchived: true });
  return Promise.all(rules.map((r) => rl.getRule(a.deps, a.who, r.id)));
}
