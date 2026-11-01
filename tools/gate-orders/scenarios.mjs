// PR 414 follow-up (CN-013 go-live gate phase 2) — the 18 scenarios of the go-live test-order run (a real month of the
// shop in one run: owner's OK of 1 Nov 2026). Each scenario names its device and network (most orders come from
// phones) and returns its checks; the run (shop.mjs) gives it `x`: shoppers in real browsers, the order journey through
// the storefront's own buttons, and the oracle that does the admin's half with the shop's own package functions.
// A scenario that needs what the shop has not switched on (cash on delivery, gift mode, a coupon with no use limit,
// delivery charges) is a SKIP with the reason, never a failure, and the run switches nothing on for the shop's visitors.
// Live run 1 Nov: the run pays on the mock bKash through its own grant (lib/run-grant.mjs); a scenario marked `cod`
// needs cash on delivery and is a SKIP "COD is off (owner's setting)" unless the owner keeps it on or runs with
// `allow_cod`.
import { COD_OFF } from "./lib/run-grant.mjs";
import { check, fail, pass, skip } from "./lib/verdict.mjs";
import { customerCancel, fillDetails, loseNextAnswer, payPage, pickZone, setQuantity, submit, waitAwake } from "./lib/shopper.mjs";

const no = (r) => r?.skip ?? r?.error ?? null;

/** A placed order is a check: PASS with its number, a SKIP with the shop's reason, a FAIL with the error. */
function placed(id, r) {
  if (r.skip) return skip(id, r.skip);
  if (!r.number) return fail(id, r.error ?? "no order number came back");
  return pass(id, `order ${r.number}`);
}

export const GATE_CHECKS = {
  1: "A mock-bKash-paid order: no message asks for money and the sticker says collect 0",
  4: "Book, record a payment, re-book: the courier gets the new cash-on-delivery amount",
  7: "Gift: sticker and receiver's details only while gift mode (checkout.gift) is on",
  21: "bKash fails, then the retry: one order, one paid payment",
  23: "The courier's statement with a planted mismatch is flagged",
  24: "A 2.1 kg parcel follows its weight slab",
};

/** The scenario that proves each gate check. */
export const GATE_SCENARIO = { 1: "5", 4: "15", 7: "18", 21: "6", 23: "18", 24: "18" };

/** A gate check its scenario never reached: not asked is a SKIP; asked but stopped before it is a FAIL. */
export function unreachedGate(id, what, pickedIds) {
  const s = GATE_SCENARIO[id];
  return pickedIds.includes(s) ? { id, what, verdict: "FAIL", detail: `scenario ${s} stopped before this check (see its row)` } : { id, what, verdict: "SKIP", detail: `its scenario (${s}) was not asked in this run` };
}

/** What a press with no order answer showed: the Confirm button, the box the form marks, or where the page went. */
const noAnswer = (p) =>
  p.unanswered ? `no answer (Confirm ${p.unanswered.off ? "off" : "on"}${p.unanswered.field ? `, ${p.unanswered.field} marked` : ""})` : `no answer (${p.presses} reply unread, at ${String(p.url ?? "").replace(/^https?:\/\/[^/]+/, "")})`;

export const SCENARIOS = [
  {
    id: "1",
    title: "One item, cash on delivery, phone on 4G",
    device: "android-mid",
    network: "4g",
    cod: true,
    async run(x) {
      const sh = await x.open(this.device, this.network);
      const r = await x.order(sh, { items: x.v(1), address: "dhaka", timed: true });
      const o = r.number ? await x.call("order", { number: r.number }) : null;
      return [placed("placed", r), o ? check("one line", o.items.length === 1, `${o.items.length} lines`) : skip("one line", no(r)), o ? (x.pay === "cod" ? check("cash on delivery", o.paymentMethod === "COD", String(o.paymentMethod)) : check("paid on the mock bKash (cash on delivery is off)", o.paymentMethod === "BKASH" && o.dueMinor === 0, `${String(o.paymentMethod)}, due ${o.dueMinor}`)) : skip("cash on delivery", no(r))];
    },
  },
  {
    id: "2",
    title: "Three items, low-end Android on slow 3G",
    device: "android-low",
    network: "slow-3g",
    async run(x) {
      const sh = await x.open(this.device, this.network);
      const r = await x.order(sh, { items: x.v(3), address: "suburb", timed: true });
      const o = r.number ? await x.call("order", { number: r.number }) : null;
      return [placed("placed", r), o ? check("three lines", o.items.length === 3, `${o.items.length} lines`) : skip("three lines", no(r))];
    },
  },
  {
    id: "3",
    title: "Eight different items on a desktop",
    device: "desktop-1366",
    network: "wifi",
    async run(x) {
      const sh = await x.open(this.device, this.network);
      const r = await x.order(sh, { items: x.v(8), address: "outside", timed: true });
      const o = r.number ? await x.call("order", { number: r.number }) : null;
      return [placed("placed", r), o ? check("eight lines", o.items.length === 8, `${o.items.length} lines`) : skip("eight lines", no(r))];
    },
  },
  {
    id: "4",
    title: "The same item twice, and the last pieces of its stock",
    device: "iphone-se",
    network: "fast-3g",
    async run(x) {
      const v = x.reserved.lastPiece;
      await x.call("setStock", { variantId: v.id, qty: 2 });
      const sh = await x.open(this.device, this.network);
      const r = await x.order(sh, { items: [v], qty: 2, address: "outside", timed: true });
      const out = [placed("placed", r)];
      if (!r.number) return out;
      const o = await x.call("order", { number: r.number });
      out.push(check("quantity 2 on one line", o.items.length === 1 && o.items[0].quantity === 2, JSON.stringify(o.items.map((i) => i.quantity))));
      const left = (await x.call("stock", { variantIds: [v.id] }))[v.id];
      out.push(check("stock is 0 after the order", left === 0, `${left} left`));
      const late = await x.open("android-mid", "4g");
      const a = await x.add(late, v);
      out.push(check("the next shopper is told it is sold out", !a.ok, a.ok ? "the bag took a piece that is gone" : `refused: ${a.error ?? "the size is shown as sold out"}`));
      return out;
    },
  },
  {
    id: "5",
    title: "Mock bKash, paid ahead (gate check 1)",
    device: "android-mid",
    network: "4g",
    async run(x) {
      if (x.canPrepay) return [skip("paid ahead", x.canPrepay)];
      const sh = await x.open(this.device, this.network);
      const r = await x.order(sh, { items: x.v(1), address: "outside", pay: "bkash", timed: true });
      if (!r.number) return [placed("placed", r)];
      const paid = await payPage(sh, "approve");
      if (paid.skip) return [placed("placed", r), skip("paid", paid.skip)];
      const o = await x.call("order", { number: r.number });
      const out = [placed("placed", r), check("paid in full", o.dueMinor === 0 && o.payments.some((p) => p.status === "PAID"), `due ${o.dueMinor}`), check("thank-you page", /\/checkout\/thanks\//.test(paid.url), paid.url.replace(/^https?:\/\/[^/]+/, ""))];
      if (x.canBook) {
        x.gate("1", skip("1", x.canBook));
        return out;
      }
      const c = await x.call("check1", { number: r.number });
      x.booked(r.number, c.booked);
      const asks = (c.messages.rows ?? []).filter((m) => m.sent && m.asksMoney);
      const ok = c.codToCollectMinor === 0 && c.booked?.booked && c.booked.courier?.codMinor === 0 && c.booked.sticker?.collectMinor === 0 && asks.length === 0;
      x.gate("1", check("1", ok, `rider collects ${c.codToCollectMinor}, courier sent ${c.booked?.courier?.codMinor ?? "—"}, sticker says ${c.booked?.sticker?.collectMinor ?? c.booked?.stickerError ?? "—"}; ${c.messages.checked} journey messages filled, ${asks.length} would ask for money`));
      return [...out, check("collect 0 on the sticker", c.booked?.sticker?.collectMinor === 0, String(c.booked?.sticker?.collectMinor ?? c.booked?.stickerError ?? c.booked?.code ?? "not booked")), check("no message asks for money", asks.length === 0, asks.map((m) => `${m.step} ${m.channel} ${m.locale}`).join(", "))];
    },
  },
  {
    id: "6",
    title: "Mock bKash fails, then the retry (gate check 21)",
    device: "iphone",
    network: "4g",
    async run(x) {
      if (x.canPrepay) {
        x.gate("21", skip("21", x.canPrepay));
        return [skip("fail then retry", x.canPrepay)];
      }
      const c = x.newCustomer();
      const sh = await x.open(this.device, this.network);
      const r = await x.order(sh, { items: x.v(1), address: "dhaka", pay: "bkash", customer: c, timed: true });
      if (!r.number) return [placed("placed", r)];
      const f = await payPage(sh, "fail");
      if (f.skip) {
        x.gate("21", skip("21", f.skip));
        return [placed("placed", r), skip("fail then retry", f.skip)];
      }
      const again = await payPage(sh, "retry");
      const paid = again.skip ? again : await payPage(sh, "approve");
      const k = await x.call("check21", { number: r.number, phone: c.phone, since: x.since });
      const ok = f.failedShown && !paid.skip && k.orders === 1 && k.paid === 1;
      x.gate("21", check("21", ok, `failure shown: ${f.failedShown}; ${k.orders} order, ${k.paid} paid payment, ${k.failed} failed try`));
      return [placed("placed", r), check("the failure is shown with a retry", f.failedShown && f.retryShown, `failed: ${f.failedShown}, retry: ${f.retryShown}`), check("one order", k.orders === 1, `${k.orders} orders`), check("one paid payment", k.paid === 1, `${k.paid} paid of ${k.payments}`)];
    },
  },
  {
    id: "7",
    title: "One customer, eight orders in a month, three cancelled",
    device: "android-low",
    network: "4g",
    async run(x) {
      const c = x.newCustomer();
      const sh = await x.open(this.device, this.network);
      const kinds = ["dhaka", "outside", "suburb", "outside", "outside", "outside", "dhaka", "outside"]; // his own home, family and work across the country
      const out = [];
      const numbers = [];
      const pieces = [];
      for (const [i, kind] of kinds.entries()) {
        const [v] = x.v(1);
        const r = await x.order(sh, { items: [v], address: kind, customer: c, timed: i === 0 });
        if (r.skip) return [skip("placed", r.skip)];
        out.push(placed(`order ${i + 1}`, r));
        if (r.number) {
          numbers.push(r.number);
          pieces.push(v.id);
        }
      }
      const cancel = numbers.slice(1, 4);
      const cancelPieces = pieces.slice(1, 4);
      const before = await x.call("stock", { variantIds: cancelPieces });
      const by = [];
      for (const n of cancel) {
        const own = await customerCancel(sh, x.base, n).catch((e) => ({ done: false, error: String(e) }));
        if (own.done) by.push("customer");
        else {
          await x.call("cancel", { number: n, note: "scenario 7: the shop does not offer the customer's own cancel here, so the admin cancels" });
          by.push("admin");
        }
      }
      const after = await x.call("stock", { variantIds: cancelPieces });
      const back = cancelPieces.every((id) => after[id] === before[id] + 1);
      const states = await Promise.all(cancel.map((n) => x.call("order", { number: n })));
      const all = await x.call("ordersOf", { phone: c.phone, since: x.since });
      const sales = await x.call("sales", { since: x.since, numbers: cancel });
      out.push(
        check("eight orders for the one number", all.orders.length === kinds.length, `${all.orders.length} orders`),
        check("three cancelled", states.every((o) => o.status === "CANCELLED"), `${states.map((o) => o.status).join(", ")} (by ${by.join(", ")})`),
        check("their stock came back", back, cancelPieces.map((id) => `${before[id]}→${after[id]}`).join(", ")),
        check("cancelled orders are not sales", sales.countedAsSales.length === 0 && sales.gateSkusSold === 0, `${sales.countedAsSales.length} counted as sales, ${sales.gateSkusSold} test pieces in sales by SKU`),
      );
      return out;
    },
  },
  {
    id: "8",
    title: "The Bengali checkout (/bn), Bengali digits in the phone",
    device: "android-mid",
    network: "fast-3g",
    async run(x) {
      const sh = await x.open(this.device, this.network, { locale: "bn-BD" });
      const r = await x.order(sh, { items: x.v(2), address: (a) => a.quirk === "bengali" || a.quirk === "mixed", lang: "bn", phoneFormat: "bengali", timed: true });
      const o = r.number ? await x.call("order", { number: r.number }) : null;
      return [placed("placed", r), o ? check("the order is in Bengali", o.lang === "bn", String(o.lang)) : skip("the order is in Bengali", no(r))];
    },
  },
  {
    id: "9",
    title: "A wrong phone number and a missing address first, then corrected",
    device: "iphone",
    network: "4g",
    async run(x) {
      const c = x.newCustomer();
      const sh = await x.open(this.device, this.network);
      let refused = null;
      const r = await x.order(sh, {
        items: x.v(1),
        address: "outside",
        customer: c,
        timed: true,
        async beforeDetails(s, typed) {
          await s.page.locator("#co-name").fill(typed.name);
          await s.page.locator("#co-phone").fill(typed.phone.slice(0, 6));
          await s.page.locator("#co-address").fill("");
          const first = await submit(s, { waitNext: false });
          const ready = await s.page.locator('[data-testid="co-form"]').getAttribute("data-ready");
          refused = { answered: first.answer, presses: first.presses, numbers: first.numbers, ready, url: first.url };
        },
      });
      const all = await x.call("ordersOf", { phone: c.phone, since: x.since });
      const wasRefused = refused && !refused.numbers?.length && !/\/checkout\/(thanks|pay)\//.test(refused.url) && !(refused.answered?.ok);
      return [check("the wrong details are refused", !!wasRefused, refused ? `form ready ${refused.ready}, ${refused.presses} order calls` : "not tried"), placed("placed after the fix", r), check("exactly one order", all.orders.length === 1, `${all.orders.length} orders`)];
    },
  },
  {
    id: "10",
    title: "Double-tap on Confirm, a reload mid-checkout and Back after it",
    device: "android-mid",
    network: "4g",
    async run(x) {
      const c = x.newCustomer();
      const sh = await x.open(this.device, this.network);
      let reloaded = null;
      const r = await x.order(sh, {
        items: x.v(1),
        address: "dhaka",
        customer: c,
        submitOpts: { double: true },
        timed: true,
        async beforeSubmit(s, typed, address) {
          await s.page.reload({ waitUntil: "load" });
          await s.page.locator('[data-testid="co-form"]').waitFor({ state: "visible" });
          await waitAwake(s, "#co-name");
          const kept = (await s.page.locator("#co-address").inputValue()).length > 0;
          reloaded = kept ? "the details were kept" : "typed again";
          // as the customer does: types what is gone again and leaves the address box, so the shop reads the place
          if (!kept) await fillDetails(s, typed);
          await pickZone(s, address?.pick ?? address?.band ?? null);
        },
      });
      if (r.number) {
        await sh.page.goBack({ waitUntil: "load" }).catch(() => null);
        const again = sh.page.locator('[data-testid="co-confirm"]:visible');
        if ((await again.count()) && (await again.first().isEnabled())) await submit(sh, { waitNext: false });
      }
      const all = await x.call("ordersOf", { phone: c.phone, since: x.since });
      return [placed("placed", r), check("exactly one order", all.orders.length === 1, `${all.orders.length} orders after a double tap, a reload (${reloaded}) and Back`)];
    },
  },
  {
    id: "11",
    title: "The network drops while the order is sent, then he presses again",
    device: "android-mid",
    network: "fast-3g",
    async run(x) {
      const c = x.newCustomer();
      const sh = await x.open(this.device, this.network);
      let lost = null;
      const r = await x.order(sh, {
        items: x.v(1),
        address: "outside",
        customer: c,
        timed: true,
        async beforeSubmit(s) {
          const restore = await loseNextAnswer(s);
          lost = await submit(s, { waitNext: false });
          await restore();
        },
      });
      const all = await x.call("ordersOf", { phone: c.phone, since: x.since });
      return [check("the lost answer leaves him on the checkout", !!lost && !/\/checkout\/(thanks|pay)\//.test(lost.url), lost ? lost.url.replace(/^https?:\/\/[^/]+/, "") : "not tried"), placed("placed on the second press", r), check("exactly one order", all.orders.length === 1, `${all.orders.length} orders`)];
    },
  },
  {
    id: "12",
    title: "A guest order, then signed in with the sign-in code (mock SMS)",
    device: "iphone",
    network: "wifi",
    async run(x) {
      const c = x.newCustomer();
      const sh = await x.open(this.device, this.network);
      const g = await x.order(sh, { items: x.v(1), address: "dhaka", customer: c, timed: true });
      if (!g.number) return [placed("guest order", g)];
      const code = await x.call("otp", { phone: c.phone });
      if (!code.known || !code.code) return [placed("guest order", g), skip("signed in", "the guest order made no account for the number, so no sign-in code is sent")];
      x.secret(code.code);
      const login = await sh.page.evaluate(
        async ({ phone, code }) => {
          const r = await fetch("/api/account/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone, code }), credentials: "same-origin" });
          return { status: r.status, ok: (await r.json().catch(() => ({}))).ok === true };
        },
        { phone: c.phone, code: code.code },
      );
      const s = await x.order(sh, { items: x.v(1), address: "outside", customer: c });
      const [o1, o2] = await Promise.all([x.call("order", { number: g.number }), s.number ? x.call("order", { number: s.number }) : null]);
      return [placed("guest order", g), check("signed in with the code", login.ok, `answer ${login.status}`), placed("signed-in order", s), o2 ? check("both orders are the same customer's", !!o2.customerId && o2.customerId === o1.customerId, o1.customerId === o2.customerId ? "one customer" : "two customers") : skip("same customer", no(s))];
    },
  },
  {
    id: "13",
    title: "Delivery inside Dhaka, a Dhaka suburb and outside Dhaka, with the owner's charges",
    device: "tablet",
    network: "4g",
    async run(x) {
      const sh = await x.open(this.device, this.network);
      const out = [];
      const priced = x.sw.bands.filter((b) => b.enabled);
      for (const kind of ["dhaka", "suburb", "outside"]) {
        const r = await x.order(sh, { items: x.v(1), address: kind, timed: kind === "dhaka" });
        out.push(placed(`${kind} order`, r));
        if (!r.number) continue;
        const o = await x.call("order", { number: r.number });
        if (!priced.length) {
          out.push(skip(`${kind} charge`, "no delivery band is switched on yet (the owner's delivery charges): only the address round trip is checked"));
          continue;
        }
        const want = priced.find((b) => b.key === r.address.band);
        if (!want) {
          out.push(skip(`${kind} charge`, `the band ${r.address.band} is not switched on`));
          continue;
        }
        out.push(check(`${kind} band`, o.band?.key === want.key, `${o.band?.key ?? "none"} (wanted ${want.key})`));
        out.push(check(`${kind} charge`, o.deliveryChargeMinor === want.chargeMinor || o.deliveryChargeMinor === 0, `${o.deliveryChargeMinor} (band ${want.chargeMinor}${o.deliveryChargeMinor === 0 ? "; free delivery" : ""})`));
      }
      return out;
    },
  },
  {
    id: "14",
    title: "A coupon the owner made (only one with no use limit; none is ever made)",
    device: "desktop-1920",
    network: "wifi",
    async run(x) {
      const cp = x.sw.coupon;
      if (!cp) return [skip("coupon", "the owner has no open coupon without a use limit: none is made by the run")];
      x.secret(cp.code);
      const sh = await x.open(this.device, this.network);
      const r = await x.order(sh, {
        items: x.v(3),
        address: "outside",
        timed: true,
        async beforeCheckout(s) {
          await s.page.evaluate(async (code) => fetch("/api/bag/code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }), credentials: "same-origin" }), cp.code);
        },
      });
      const o = r.number ? await x.call("order", { number: r.number }) : null;
      return [placed("placed", r), o ? check("the coupon is on the order", o.couponApplied && o.discountMinor > 0, `discount ${o.discountMinor}`) : skip("coupon", no(r))];
    },
  },
  {
    id: "15",
    title: "The admin adds a piece, records a payment and re-books (gate check 4)",
    device: "android-mid",
    network: "4g",
    cod: true,
    gates: ["4"],
    async run(x) {
      if (x.canBook) {
        x.gate("4", skip("4", x.canBook));
        return [skip("re-book", x.canBook)];
      }
      if (x.pay !== "cod") {
        x.gate("4", skip("4", COD_OFF));
        return [skip("re-book", COD_OFF)];
      }
      const sh = await x.open(this.device, this.network);
      const r = await x.order(sh, { items: x.v(1), address: "dhaka", timed: true });
      if (!r.number) return [placed("placed", r)];
      const [extra] = x.v(1);
      const k = await x.call("check4", { number: r.number, variantId: extra.id });
      if (k.rebook) x.booked(r.number, k.rebook);
      else if (k.first?.booked) x.booked(r.number, k.first);
      if (k.manualOff) {
        // live run 2 (1 Nov): an owner's switch that is off is a SKIP with its reason, never a FAIL
        x.gate("4", skip("4", k.manualOff));
        return [placed("placed", r), check("the admin added a piece", k.added, `+${k.addedMinor}`), check("booked", !!k.first?.booked, k.first?.code ?? ""), skip("re-booked at the new amount", k.manualOff)];
      }
      const ok = k.added && k.first?.booked && k.stale?.why === "COD_CHANGED" && k.rebook?.outcome === "booked" && k.rebook?.courier?.codMinor === k.dueMinor;
      x.gate("4", check("4", ok, `piece added (+${k.addedMinor}); first booking ${k.first?.courier?.codMinor ?? "—"}; payment ${k.recordedMinor} recorded; parcel ${k.stale?.why ?? "not stale"}; re-booked at ${k.rebook?.courier?.codMinor ?? "—"} = due ${k.dueMinor}`));
      return [placed("placed", r), check("the admin added a piece", k.added, `+${k.addedMinor}`), check("booked", !!k.first?.booked, k.first?.code ?? ""), check("re-booked at the new amount", !!ok, `${k.rebook?.courier?.codMinor ?? "—"} vs due ${k.dueMinor}`)];
    },
  },
  {
    id: "16",
    title: "Partial delivery, a return and an exchange (on the mocks)",
    device: "android-mid",
    network: "4g",
    async run() {
      return [skip("partial, return, exchange", "each needs a delivered parcel: on the preview site that would count as a real sale and move the courier's cash, so it is proved on the practice courier in CI (packages/payments and packages/orders return, exchange and partial-delivery database tests) and not here")];
    },
  },
  {
    id: "17",
    title: "Two shoppers race for the last piece",
    device: "android-mid",
    network: "wifi",
    async run(x) {
      const v = x.reserved.race;
      await x.call("setStock", { variantId: v.id, qty: 1 });
      const [c1, c2] = [x.newCustomer(), x.newCustomer()];
      const [a, b] = [await x.open("android-mid", "wifi"), await x.open("iphone", "wifi")];
      const ready = [];
      for (const [sh, c] of [[a, c1], [b, c2]]) ready.push(await x.ready(sh, { items: [v], address: "dhaka", customer: c }));
      const go = ready.filter((r) => r.ok);
      const presses = await Promise.all(go.map((r) => submit(r.sh)));
      const counts = await Promise.all([c1, c2].map((c) => x.call("ordersOf", { phone: c.phone, since: x.since })));
      const total = counts.reduce((s, k) => s + k.orders.length, 0);
      for (const [i, p] of presses.entries()) {
        if (!p.answer?.number) continue;
        x.track(p.answer.number, go[i]);
        await x.settle(go[i].sh, p);
      }
      // the shop's answer to the one who lost is OUT_OF_STOCK, and its checkout sends him back to the bag at once, where
      // the line says it is sold out (CheckoutForm): the reply's body is often gone with that page, so the bag is read
      const sentBack = await Promise.all(presses.map((p, i) => (p.answer?.ok || !/\/bag(?:[?#]|$)/.test(String(p.url ?? "")) ? false : go[i].sh.page.locator('[data-testid="bag-stock-issue"]').first().waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false))));
      const told = ready.some((r) => !r.ok && /OUT_OF_STOCK|sold out/i.test(r.error ?? "")) || presses.some((p) => p.answer?.error === "OUT_OF_STOCK") || sentBack.some(Boolean);
      const said = presses.map((p, i) => p.answer?.error ?? (p.answer?.ok ? "placed" : sentBack[i] ? "sent back to the bag, which says the piece is sold out" : noAnswer(p)));
      return [check("one shopper wins", total === 1, `${total} orders for the last piece`), check("the other is told clearly", told, ready.map((r) => (r.ok ? "reached the checkout" : r.error)).join("; ") + "; " + said.join(", "))];
    },
  },
  {
    id: "18",
    title: "A 2.1 kg parcel, the courier's statement with a planted mismatch, and a gift (gate checks 24, 23, 7)",
    device: "desktop-1366",
    network: "4g",
    async run(x) {
      const out = [];
      if (x.canBook) {
        x.gate("24", skip("24", x.canBook));
        x.gate("23", skip("23", x.canBook));
      } else {
        const sh = await x.open(this.device, this.network);
        const pieces = x.polos(Math.round(x.weightCheckGrams / x.polos(1)[0].weightGrams));
        const r = await x.order(sh, { items: pieces, address: "outside", timed: true });
        out.push(placed("2.1 kg order", r));
        if (r.number) {
          const b = await x.call("book", { number: r.number });
          x.booked(r.number, b);
          const w = await x.call("check24", { number: r.number });
          const slabs = w.accounts.filter((a) => a.slab);
          const slabOk = slabs.every((a) => a.slab.from <= x.weightCheckGrams && x.weightCheckGrams <= a.slab.to && (!a.oneKilo || a.oneKilo.to < x.weightCheckGrams || a.slab.chargeMinor === a.oneKilo.chargeMinor));
          x.gate("24", w.rateCards ? check("24", w.weightSent === x.weightCheckGrams && slabOk && slabs.length > 0, `courier sent ${w.weightSent} g; ${slabs.length} rate card(s) price it by the ${slabs.map((a) => `${a.slab.from}–${a.slab.to} g`).join(", ") || "none"} slab`) : check("24", w.weightSent === x.weightCheckGrams, `courier sent ${w.weightSent} g (no rate card yet, so the slab price is not checked)`, w.weightSent === x.weightCheckGrams ? "no courier rate card is entered yet (owner data): the weight was sent right, the slab price is not checked" : null));
          out.push(check("the courier gets 2.1 kg", w.weightSent === x.weightCheckGrams, `${w.weightSent} g`));
          if (x.pay !== "cod") x.gate("23", skip("23", `${COD_OFF}: no parcel owes cash`));
          else {
            const s = await x.call("check23", { number: r.number });
            const ours = s.lines?.find((l) => l.ours);
            const stranger = s.lines?.find((l) => !l.ours);
            const ok = s.imported && ours?.matchState === "MISMATCH" && stranger?.matchState === "MISMATCH";
            x.gate("23", s.imported ? check("23", ok, `our parcel: ${ours?.matchState} ${ours?.reasonCode ?? ""}; a parcel we never booked: ${stranger?.matchState} ${stranger?.reasonCode ?? ""}`) : skip("23", s.why));
            out.push(s.imported ? check("the statement's mismatches are flagged", ok, `${s.mismatched} of ${s.lines.length} lines`) : skip("statement", s.why));
          }
        } else {
          x.gate("24", skip("24", no(r) ?? "no order"));
          x.gate("23", skip("23", no(r) ?? "no order"));
        }
      }
      // gate check 7: the gift order, only while the owner's gift mode is on (it is paid ahead: test payments needed)
      if (!x.sw.gift) x.gate("7", skip("7", "gift mode is off (checkout.gift): no gift order, no gift sticker and no receiver's message — as it should be"));
      else if (x.canPrepay) x.gate("7", skip("7", x.canPrepay));
      else if (x.canBook) x.gate("7", skip("7", x.canBook));
      else {
        const sh = await x.open("iphone", "4g");
        const sender = x.newCustomer();
        const r = await x.order(sh, {
          items: x.v(1),
          address: "outside",
          gift: { from: x.name(sender.n), contact: sender.phone },
          pay: "bkash",
        });
        out.push(placed("gift order", r));
        if (r.number) {
          const paid = await payPage(sh, "approve");
          if (paid.skip) x.gate("7", skip("7", paid.skip));
          else {
            const b = await x.call("book", { number: r.number });
            x.booked(r.number, b);
            const o = await x.call("order", { number: r.number });
            const ok = o.isGift && b.booked && !!b.sticker?.gift && b.courier?.phone && b.courier.phone.slice(-10) === r.typed.localPhone.slice(-10);
            x.gate("7", check("7", ok, `gift ${o.isGift}; sticker shows the sender: ${!!b.sticker?.gift?.from}; the courier calls the receiver: ${b.courier?.phone?.slice(-10) === r.typed.localPhone.slice(-10)}`));
          }
        } else x.gate("7", skip("7", no(r) ?? "no order"));
      }
      return out.length ? out : [skip("parcel checks", x.canBook ?? "nothing to run")];
    },
  },
];

/** The scenarios asked for: "all", or a list such as "1,5,7" (unknown ids are reported, never guessed). */
export function pickScenarios(asked, list = SCENARIOS) {
  const s = String(asked ?? "all").trim().toLowerCase();
  if (!s || s === "all") return { picked: list, unknown: [] };
  const ids = [...new Set(s.split(/[\s,]+/).filter(Boolean))];
  return { picked: list.filter((x) => ids.includes(x.id)), unknown: ids.filter((id) => !list.some((x) => x.id === id)) };
}
