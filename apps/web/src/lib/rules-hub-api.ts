// S28 · PR 676–679 — the Rules page's admin routes (the one-page Rules screen, the pop-up hub and Offers & Discounts 360). They hang
// off the same catch-all as the Smart Rules routes (`rulesRoute` hands the paths `hub`, `popups` and `offers` here). Every route signs
// the person in, checks the permission, and calls @extas/rules, which checks it again and writes the audit log. A change that moves
// money (a rule marked "money", an offer going live, paused, resumed or ended) also asks for the owner's PIN (`pin` in the body),
// checked here before anything is written (CLAUDE.md rule 6).
//
//   GET   /api/admin/rules/hub                 the rows, pills and counts (`rules.read`)
//   PUT   /api/admin/rules/hub/:id             {version, values, pin?} one row's fields (`rules.write`; money rows: the owner's OK and PIN)
//   POST  /api/admin/rules/hub/:id/reset       {version, pin?} back to the shipped value
//   GET   /api/admin/rules/popups              the twelve placements
//   PUT   /api/admin/rules/popups/:key         {entry, version} the owner's words, window and switch (`rules.write`)
//   GET   /api/admin/rules/offers              the one list: offers, coupons, built-in rules, points, wallet, results
//   POST  /api/admin/rules/offers              a new offer (a draft)
//   GET   /api/admin/rules/offers/:id          one offer with its history · PUT {offer} change a draft
//   POST  /api/admin/rules/offers/:id/submit   send the draft for the owner's OK
//   POST  /api/admin/rules/offers/:id/send-back  {note?} the owner sends it back (`rules.approve`)
//   POST  /api/admin/rules/offers/:id/approve  {pin} the owner makes it live
//   POST  /api/admin/rules/offers/:id/state    {action: pause | resume | end, pin}
import { verifyOwnerPin, type Actor, type RequestContext } from '@extas/auth';
import * as rl from '@extas/rules';
import { HUB_ROWS, type HubSettingRow } from '@extas/rules/pure';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';

type Ctx = { deps: rl.RulesDeps; eidDeps: rl.EidDeps; who: rl.Who; url: URL };
export type Handle = (
  request: Request,
  deps: AdminDeps | null,
  permission: 'rules.read' | 'rules.write' | 'rules.publish' | 'rules.approve',
  fn: (c: Ctx) => Promise<Record<string, unknown> | Response>,
  status?: number,
) => Promise<Response>;

const PIN_MAX_DIGITS = 12;

/** The owner's PIN, checked before a change that moves money. A wrong or missing PIN throws (the API answers with its own code). */
export async function pinCheck(deps: AdminDeps, actor: Actor, ctx: RequestContext, pin: unknown, action: string): Promise<void> {
  const [minLength, maxAttempts, lockMinutes] = await Promise.all([
    deps.resolver.value('books.pin.minLength'),
    deps.resolver.value('books.pin.maxAttempts'),
    deps.resolver.value('books.pin.lockMinutes'),
  ]);
  await verifyOwnerPin(
    deps.db,
    actor,
    typeof pin === 'string' ? pin : null,
    { minLength, maxLength: Math.max(minLength, PIN_MAX_DIGITS), maxAttempts, lockMinutes },
    { action, storeId: null, now: deps.now ? deps.now() : new Date(), ctx: { source: 'admin-api', ...ctx } },
  );
}

const hubDeps = (x: Ctx): rl.HubDeps & rl.OfferDeps => ({ ...x.deps, settings: x.eidDeps.settings });
const moneyRow = (id: string) => (HUB_ROWS.find((r): r is HubSettingRow => r.type === 'setting' && r.id === id)?.money ?? false) === true;

export async function hubRoute(request: Request, deps: AdminDeps | null, path: string[], handle: Handle): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, b, c] = path;
  const notAllowed = () => fail(405, 'method-not-allowed');

  if (a === 'hub') {
    if (!b) return m === 'GET' ? handle(request, deps, 'rules.read', async (x) => ({ hub: await rl.hubScreen(hubDeps(x), x.who) })) : notAllowed();
    if (path.length > 3) return fail(404, 'not-found');
    if (c === 'reset') {
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'rules.write', async (x) => {
        const input = await body(request);
        if (moneyRow(b)) await pinCheck(deps!, x.who.actor, x.who.ctx ?? {}, input.pin, 'rules.hub.reset');
        return { saved: await rl.resetHubRow(hubDeps(x), x.who, { id: b, version: String(input.version ?? '') }) };
      });
    }
    if (c) return fail(404, 'not-found');
    if (m !== 'PUT') return notAllowed();
    return handle(request, deps, 'rules.write', async (x) => {
      const input = await body(request);
      if (moneyRow(b)) await pinCheck(deps!, x.who.actor, x.who.ctx ?? {}, input.pin, 'rules.hub.save');
      const values = input.values && typeof input.values === 'object' && !Array.isArray(input.values) ? (input.values as Record<string, unknown>) : {};
      return { saved: await rl.saveHubRow(hubDeps(x), x.who, { id: b, version: String(input.version ?? ''), values }) };
    });
  }

  if (a === 'popups') {
    if (!b) return m === 'GET' ? handle(request, deps, 'rules.read', async (x) => ({ popups: await rl.popupsScreen(hubDeps(x), x.who) })) : notAllowed();
    if (c) return fail(404, 'not-found');
    if (m !== 'PUT') return notAllowed();
    return handle(request, deps, 'rules.write', async (x) => {
      const input = await body(request);
      return { popups: await rl.savePopup(hubDeps(x), x.who, { key: b, entry: input.entry, version: String(input.version ?? '') }) };
    });
  }

  // offers
  if (!b) {
    if (m === 'GET') return handle(request, deps, 'rules.read', async (x) => ({ offers: await rl.offersScreen(hubDeps(x), x.who) }));
    if (m === 'POST') return handle(request, deps, 'rules.write', async (x) => ({ offer: await rl.createOffer(hubDeps(x), x.who, (await body(request)).offer) }), 201);
    return notAllowed();
  }
  if (!isUuid(b)) return fail(400, 'INVALID_INPUT', ['id']);
  if (!c) {
    if (m === 'GET') return handle(request, deps, 'rules.read', async (x) => ({ ...(await rl.getOffer(hubDeps(x), x.who, b)) }));
    if (m === 'PUT') return handle(request, deps, 'rules.write', async (x) => ({ offer: await rl.updateOffer(hubDeps(x), x.who, b, (await body(request)).offer) }));
    return notAllowed();
  }
  if (m !== 'POST') return notAllowed();
  switch (c) {
    case 'submit':
      return handle(request, deps, 'rules.write', async (x) => ({ offer: await rl.submitOffer(hubDeps(x), x.who, b) }));
    case 'send-back':
      return handle(request, deps, 'rules.read', async (x) => ({ offer: await rl.sendBackOffer(hubDeps(x), x.who, b, await body(request)) }));
    case 'approve':
      return handle(request, deps, 'rules.read', async (x) => {
        await pinCheck(deps!, x.who.actor, x.who.ctx ?? {}, (await body(request)).pin, 'rules.offer.approve');
        return { offer: await rl.approveOffer(hubDeps(x), x.who, b) };
      });
    case 'state':
      return handle(request, deps, 'rules.read', async (x) => {
        const input = await body(request);
        await pinCheck(deps!, x.who.actor, x.who.ctx ?? {}, input.pin, 'rules.offer.state');
        return { offer: await rl.setOfferState(hubDeps(x), x.who, b, { action: input.action }) };
      });
    default:
      return fail(404, 'not-found');
  }
}
