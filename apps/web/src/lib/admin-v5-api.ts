// S28 · wave 5 (CN-048) — the shared door of the inbox and marketing routes of the admin prototype v5 (PR 692-699).
// Every route signs the person in (guardAdmin), checks the permission in the store it touches (`?storeId=`, default the
// mother store), then calls the package, which checks it again. Answers are `{ ok: true, … }` or `{ ok: false, error:
// CODE, details }`. The owner's switches are saved here with the value as the page read it (a stale save is refused:
// STALE) and audited. Nothing here moves money, sends to a customer or deletes anything.
import { audit, type PermissionKey } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sp from '@extas/support';
import { marketingAffiliatesSchema, marketingMetaFeedSchema, marketingMessageCampaignsSchema, marketingVerdictsSchema, messagesCostCeilingSchema, supportCommentDeskSchema, supportLiveSellingSchema, supportSavedRepliesSchema, storeTarget, type Key } from '@extas/settings';
import type { z } from 'zod';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { supportDeps } from './support-api';

export interface V5Ctx {
  admin: AdminDeps;
  who: sp.Who;
  sd: sp.SupportDeps;
  storeId: number;
  staffUserId: string | null;
}

export function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** A package's own refusal (support, marketing, …) has a `code`, a `status` and `details`: answer it as words' codes. */
function domainFail(e: unknown): Response | null {
  const x = e as { code?: unknown; status?: unknown; details?: unknown; data?: unknown; name?: unknown };
  if (e instanceof Error && typeof x.code === 'string' && typeof x.status === 'number' && /Error$/.test(String(x.name))) {
    const details = Array.isArray(x.details) ? (x.details as string[]) : [];
    return json({ ok: false, error: x.code, ...(details.length ? { details } : {}), ...(x.data ? { data: x.data } : {}) }, { status: x.status });
  }
  return null;
}

export async function v5Handle(request: Request, deps: AdminDeps | null, permission: PermissionKey, fn: (c: V5Ctx) => Promise<Record<string, unknown> | Response>, status = 200): Promise<Response> {
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const out = await fn({ admin: deps!, who: { actor: g.actor, storeId, ctx: g.ctx }, sd: supportDeps(deps!), storeId, staffUserId: g.actor.staffUserId ?? null });
    return out instanceof Response ? out : json({ ok: true, ...out }, { status });
  } catch (e) {
    return domainFail(e) ?? errorResponse(e);
  }
}

export const notAllowed = () => fail(405, 'method-not-allowed');
export const notFound = () => fail(404, 'not-found');

/** The owner's switches of this wave: which setting, how it is checked, the permission that saves it, and why. */
export const V5_SWITCHES = {
  'support.savedReplies': { schema: supportSavedRepliesSchema, perm: 'support.settings', reason: 'Inbox › Quick replies' },
  'support.commentDesk': { schema: supportCommentDeskSchema, perm: 'support.settings', reason: 'Inbox › Comments' },
  'support.liveSelling': { schema: supportLiveSellingSchema, perm: 'support.settings', reason: 'Inbox › Comments › Live selling' },
  'marketing.affiliates': { schema: marketingAffiliatesSchema, perm: 'rules.approve', reason: 'Marketing › Influencers & affiliates' },
  'messages.costCeiling': { schema: messagesCostCeilingSchema, perm: 'rules.approve', reason: 'Messages › Cost ceilings' },
  'marketing.verdicts': { schema: marketingVerdictsSchema, perm: 'marketing.campaigns.write', reason: 'Marketing › Overview verdicts' },
  'marketing.messageCampaigns': { schema: marketingMessageCampaignsSchema, perm: 'messages.campaigns.write', reason: 'Messages › Campaigns' },
  'marketing.metaFeed': { schema: marketingMetaFeedSchema, perm: 'marketing.campaigns.write', reason: 'Marketing › Meta feed' },
} as const satisfies Record<string, { schema: z.ZodType; perm: PermissionKey; reason: string }>;
export type V5SwitchKey = keyof typeof V5_SWITCHES;

/** Saves one switch: `before` must be the value the page showed (else STALE: someone saved first). */
export async function saveV5Switch(request: Request, x: V5Ctx, allowed: readonly V5SwitchKey[]): Promise<Response> {
  const b = (await body(request)) as { key?: unknown; value?: unknown; before?: unknown };
  const key = (allowed.length === 1 ? allowed[0] : b.key) as V5SwitchKey;
  if (!allowed.includes(key)) return fail(400, 'INVALID_INPUT', ['key']);
  const spec = V5_SWITCHES[key];
  const ok = spec.schema.safeParse(b.value);
  if (!ok.success) return fail(400, 'INVALID_INPUT', ok.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`));
  const at = { storeId: x.storeId };
  const before = await x.admin.resolver.value(key as Key, at);
  if (JSON.stringify(b.before) !== JSON.stringify(before)) return json({ ok: false, error: 'STALE', data: { value: before } }, { status: 409 });
  if (JSON.stringify(ok.data) !== JSON.stringify(before)) {
    await x.admin.resolver.set(key as Key, ok.data as never, storeTarget(x.storeId), { actorId: x.staffUserId, reason: spec.reason });
    await audit(x.admin.db, x.who.actor, { storeId: x.storeId, action: 'setting.save', entityType: 'Setting', entityId: key, before: { ...(before as object) }, after: { ...(ok.data as object) } }, x.who.ctx);
  }
  return json({ ok: true, key, value: ok.data });
}
