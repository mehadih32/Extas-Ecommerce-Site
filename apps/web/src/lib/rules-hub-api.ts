// S28 · PR 676–679 — the Rules page's admin routes (the one-page Rules screen, the pop-up hub and Offers & Discounts 360). They hang
// off the same catch-all as the Smart Rules routes (`rulesRoute` hands the paths `hub`, `popups` and `offers` here). Every route signs
// the person in, checks the permission, and calls @extas/rules, which checks it again and writes the audit log. A change that moves
// money (a rule marked "money", an offer going live, paused, resumed or ended) also asks for the owner's PIN (`pin` in the body),
// checked here before anything is written (CLAUDE.md rule 6).
//
//   GET   /api/admin/rules/hub                 the rows, pills and counts (`rules.read`)
//   PUT   /api/admin/rules/hub/:id             {version, values, pin?} one row's fields (`rules.write`; money rows: the owner's OK and PIN)
//   POST  /api/admin/rules/hub/:id/try         {values} PR 848: the typed numbers counted on the last 30 days' orders (read only; `rules.read`)
//   GET   /api/admin/rules/hub/sim             PR 858: the Checkout simulator's pickers · GET ?q={cart} or POST {cart} what one made-up cart pays with the live rules (read only)
//   POST  /api/admin/rules/hub/:id/schedule   PR 858: {version, values, from, pin?} start the typed numbers on a later day
//   POST  /api/admin/rules/hub/:id/unschedule  PR 858: {pin?} cancel the scheduled change (the rule stays as it is)
//   GET   /api/admin/rules/hub/:id/history   PR 867: the last changes of the row (`rules.read`)
//   POST  /api/admin/rules/hub/:id/undo      PR 867: {version, changeId, pin?} back to the value a past change replaced (a new change; money rows: the PIN)
//   PUT   /api/admin/rules/hub/:id/text      PR 867: {text: {bn, en} | null} the owner's own customer wording, or back to the automatic words (`rules.write`)
//   POST  /api/admin/rules/hub/:id/reset     {version, pin?} back to the shipped value
//   GET   /api/admin/rules/popups              the twelve placements
//   PUT   /api/admin/rules/popups/:key         {entry, version} the owner's words, window and switch (`rules.write`)
//   GET   /api/admin/rules/popups/:key/history PR 949: the last changes of the placement (`rules.read`)
//   POST  /api/admin/rules/popups/:key/undo    PR 949: {version, changeId} back to what a past change replaced (a new change)
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
    if (b === 'sim') {
      // PR 858: the Checkout simulator — GET gives the pickers, POST {bandKey, cartMinor, pieces, categoryId?, paymentMethod, couponCode?, newCustomer} prices one made-up cart (read only)
      if (c) return fail(404, 'not-found');
      if (m === 'GET') {
        // the screen asks with GET ?q=<the cart as JSON> so the read-only check account can open the page (it may not send POST)
        const q = new URL(request.url).searchParams.get('q');
        if (q === null) return handle(request, deps, 'rules.read', async (x) => ({ choices: await rl.simChoices(x.deps, x.who) }));
        let cart: unknown = null;
        try {
          cart = JSON.parse(q);
        } catch {
          cart = null;
        }
        return handle(request, deps, 'rules.read', async (x) => ({ sim: await rl.simulateCheckout(x.deps, x.who, cart) }));
      }
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'rules.read', async (x) => ({ sim: await rl.simulateCheckout(x.deps, x.who, await body(request)) }));
    }
    if (c === 'try') {
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'rules.read', async (x) => {
        const input = await body(request);
        const values = input.values && typeof input.values === 'object' && !Array.isArray(input.values) ? (input.values as Record<string, unknown>) : {};
        return { tried: await rl.tryHubRow(hubDeps(x), x.who, { id: b, values }) };
      });
    }
    if (c === 'history') {
      if (m !== 'GET') return notAllowed();
      return handle(request, deps, 'rules.read', async (x) => ({ history: await rl.hubHistory(hubDeps(x), x.who, { id: b }) }));
    }
    if (c === 'undo') {
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'rules.write', async (x) => {
        const input = await body(request);
        if (moneyRow(b)) await pinCheck(deps!, x.who.actor, x.who.ctx ?? {}, input.pin, 'rules.hub.undo');
        return { saved: await rl.undoHubRow(hubDeps(x), x.who, { id: b, changeId: String(input.changeId ?? ''), version: String(input.version ?? '') }) };
      });
    }
    if (c === 'text') {
      if (m !== 'PUT') return notAllowed();
      return handle(request, deps, 'rules.write', async (x) => {
        const input = await body(request);
        const t = input.text && typeof input.text === 'object' && !Array.isArray(input.text) ? (input.text as { bn: unknown; en: unknown }) : null;
        return { text: await rl.saveHubText(hubDeps(x), x.who, { id: b, text: t }) };
      });
    }
    if (c === 'reset') {
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'rules.write', async (x) => {
        const input = await body(request);
        if (moneyRow(b)) await pinCheck(deps!, x.who.actor, x.who.ctx ?? {}, input.pin, 'rules.hub.reset');
        return { saved: await rl.resetHubRow(hubDeps(x), x.who, { id: b, version: String(input.version ?? '') }) };
      });
    }
    if (c === 'schedule' || c === 'unschedule') {
      // PR 858: "Start on a later date" (money rows need the PIN either way)
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'rules.write', async (x) => {
        const input = await body(request);
        if (moneyRow(b)) await pinCheck(deps!, x.who.actor, x.who.ctx ?? {}, input.pin, c === 'schedule' ? 'rules.hub.schedule' : 'rules.hub.schedule.cancel');
        if (c === 'unschedule') return { cancelled: await rl.cancelHubSchedule(hubDeps(x), x.who, { id: b }) };
        const values = input.values && typeof input.values === 'object' && !Array.isArray(input.values) ? (input.values as Record<string, unknown>) : {};
        return { scheduled: await rl.scheduleHubRow(hubDeps(x), x.who, { id: b, version: String(input.version ?? ''), values, from: input.from }) };
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
    if (c === 'history') {
      if (m !== 'GET') return notAllowed();
      return handle(request, deps, 'rules.read', async (x) => ({ history: await rl.popupHistory(hubDeps(x), x.who, { key: b }) }));
    }
    if (c === 'undo') {
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'rules.write', async (x) => {
        const input = await body(request);
        return { popups: await rl.undoPopup(hubDeps(x), x.who, { key: b, changeId: String(input.changeId ?? ''), version: String(input.version ?? '') }) };
      });
    }
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
