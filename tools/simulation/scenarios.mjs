// PR 414 follow-up (follow-up 668, CN-036) — the 70 orders of the real-life journey simulation as scenarios of the
// gate-orders run (tools/gate-orders/shop.mjs with GATE_PLAN=simulation; infra/deploy/gate-orders.sh; the workflow
// .github/workflows/simulation.yml, by hand only). One scenario per plan row (plan.json): a shopper on the row's device
// and network places the row's basket to the row's address the way the customer does, and the oracle reads back what
// the shop stored and showed. Checked where the system itself can prove it: one order per shopper (a double tap or a
// lost answer makes no second order), the lines and quantities, cash on delivery with the rider collecting the order's
// due, a Bengali order in Bengali, no automatic block for a risky buyer, never held over an unclear address, a coupon
// that is not his refused with a reason, a repeat buyer kept as one customer, the booking and the sticker at the
// order's due, and a cancel before packing that releases the stock. A row whose payment method or courier is switched
// off on the shop is a SKIP with its reason. Every order is cancelled at the end by the run's clean-up; nothing is
// deleted, no money moves, no real buyer gets a message (every connection is its mock).
import { readFileSync } from "node:fs";
import { DATA } from "../gate-orders/lib/test-data.mjs";
import { check, fail, pass, skip } from "../gate-orders/lib/verdict.mjs";
import { inLang, loseNextAnswer, submit } from "../gate-orders/lib/shopper.mjs";
import { courierState, payState, rowTitle } from "./lib.mjs";

export const PLAN_DATA = JSON.parse(readFileSync(new URL("./plan.json", import.meta.url), "utf8"));

/** A made-up code no shop ever issues (row 15: a code that is not his is refused with a reason). */
export const NOT_A_CODE = "GATETESTNOTACODE";

const CLOSED = ["CANCELLED"];
const no = (r) => r?.skip ?? r?.error ?? null;

/** What one run remembers between rows: the courier facts (read once) and the last shopper (a repeat buyer). */
export function runMemory() {
  return { couriers: undefined, last: null };
}
let memory = runMemory();
/** A fresh memory (each run, and the tests). */
export function resetMemory() {
  memory = runMemory();
}

/** The row's pieces from the GATE TEST shelf: one product in several sizes ("two sizes", a family's S, M, L), else different pieces. */
export function piecesOf(x, row) {
  return row.checks.includes("twoSizes") ? x.polos(row.lines) : x.v(row.lines);
}

/** The test address the row names (tools/gate-orders/data/test-data.json). */
export function addressOf(row, data = DATA) {
  const a = data.addresses.find((x) => x.id === row.address);
  if (!a) throw new Error(`order ${row.n}: no test address "${row.address}"`);
  return a;
}

/**
 * The code box as the customer uses it (PR 112): the box POSTs the code, which only keeps it on the bag (HTTP 200 for any
 * code), and the bag page then says whether it works — `[data-testid="bag-code"]` `data-state` ("refused" for a code
 * that is not his) and its words in `[data-testid="bag-code-msg"]`. The answer is read from the bag page the customer
 * sees, never from the POST's status. `state` null: the shop shows no code box (the owner's switch).
 */
async function tryCode(sh, code, lang = "en") {
  const posted = await sh.page.evaluate(async (c) => {
    const r = await fetch("/api/bag/code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: c }), credentials: "same-origin" });
    let body = null;
    try {
      body = await r.json();
    } catch {
      body = null;
    }
    return { status: r.status, ok: r.ok && body?.ok !== false, error: body?.error ?? null };
  }, code);
  if (!posted.ok) return { ...posted, state: null, said: null };
  await sh.page.goto(new URL(inLang(lang, "/bag"), sh.page.url()).href, { waitUntil: "load" });
  const box = sh.page.locator('[data-testid="bag-code"]').first();
  const state = (await box.count()) ? await box.getAttribute("data-state") : null;
  const msg = sh.page.locator('[data-testid="bag-code-msg"]').first();
  const said = (await msg.count()) ? (await msg.innerText()).replace(/\s+/g, " ").trim() : null;
  return { status: posted.status, ok: state !== "refused", state, said, error: state === "refused" ? `the code box says: ${said || "(no words)"}` : null };
}

/** The check of a code that is not his: refused on the bag with words, and not on the order. */
export function refusedCheck(answer, o) {
  if (!answer) return skip("a code that is not his is refused", "the code box was not reached");
  if (answer.status < 400 && answer.state === null) return skip("a code that is not his is refused", "the shop shows no code box on the bag (the owner's switch)");
  return check("a code that is not his is refused with a reason", !answer.ok && !!(answer.state === "refused" ? answer.said : answer.error) && !o.couponApplied, answer.error ?? `HTTP ${answer.status}, the code box says "${answer.state}"${o.couponApplied ? ", and the order took it" : ""}`);
}

/** One plan row as a scenario of the run. */
export function rowScenario(row) {
  return {
    id: String(row.n),
    title: rowTitle(row),
    device: row.device,
    network: row.network,
    // cash on delivery is the owner's switch: a COD row waits for it (shop.mjs: SKIP "COD is off (owner's setting)")
    cod: row.pay === "cod" || row.pay === "bkash-cod",
    row,
    budgetMin: row.network === "slow-3g" ? 12 : 10,
    async run(x) {
      const out = [];
      // 1. what the shop offers now: a method or a courier switched off is a SKIP with its reason
      const p = payState(row.pay, x.sw, x.canPrepay);
      if (p.skip) return [skip("payment method", p.skip)];
      if (memory.couriers === undefined) memory.couriers = await x.call("couriers").catch(() => null);
      const c = courierState(row.courier, memory.couriers);
      if (c.skip) return [skip("courier", c.skip)];
      if (row.pay === "bkash-cod") out.push(p.first ? pass("bKash first", "offered (the run switches to cash on delivery as the customer did)") : skip("bKash first", p.firstSkip ?? "bKash is not offered"));

      // 2. the shopper: a repeat buyer is the run's last shopper again, everyone else a new sample customer
      const repeat = row.checks.includes("repeat") && memory.last ? memory.last : null;
      const cust = repeat ? repeat.customer : x.newCustomer();
      cust.count = cust.count ?? 0;
      const sh = await x.open(row.device, row.network, row.lang === "bn" ? { locale: "bn-BD" } : {});
      const items = piecesOf(x, row);
      const spec = { items, address: addressOf(row), customer: cust, lang: row.lang, timed: true };
      if (row.lines === 1 && row.qty > 1) spec.qty = row.qty;
      if (row.lang === "bn" || row.checks.includes("bnDigits")) spec.phoneFormat = "bengali";
      if (p.how !== "cod") spec.pay = p.how;
      let codeAnswer = null;
      let ownerCode = null;
      if (row.checks.includes("couponRefused")) spec.beforeCheckout = async (s) => (codeAnswer = await tryCode(s, NOT_A_CODE, row.lang));
      if (row.checks.includes("ownerCoupon")) {
        ownerCode = x.sw.coupon?.code ?? null;
        if (ownerCode) {
          x.secret(ownerCode);
          spec.beforeCheckout = async (s) => (codeAnswer = await tryCode(s, ownerCode, row.lang));
        } else out.push(skip("the owner's coupon", "the owner has no open coupon without a use limit (his codes are his; the run makes none)"));
      }
      if (row.checks.includes("doubleTap")) spec.submitOpts = { double: true };
      let lost = null;
      if (row.checks.includes("dropAtConfirm")) {
        spec.beforeSubmit = async (s) => {
          const restore = await loseNextAnswer(s);
          lost = await submit(s, { waitNext: false });
          await restore();
        };
      }

      // 3. the order, as the customer places it
      const r = await x.order(sh, spec);
      if (r.skip) return [...out, skip("placed", r.skip)];
      if (!r.number) return [...out, fail("placed", r.error ?? "no order number came back")];
      cust.count += 1;
      out.push(pass("placed", `order ${r.number}`));
      if (p.how !== "cod") {
        const paid = await x.settle(sh, { url: r.next });
        out.push(check(`paid on the practice ${p.how} page`, paid && !paid.skip, paid?.skip ?? ""));
      }
      if (lost) out.push(check("the lost answer leaves him on the checkout", !/\/checkout\/(thanks|pay)\//.test(lost.url ?? ""), String(lost.url ?? "").replace(/^https?:\/\/[^/]+/, "")));
      const all = await x.call("ordersOf", { phone: cust.phone, since: x.since });
      out.push(check(cust.count === 1 ? "one order for this shopper" : `his orders in this run: ${cust.count}`, all.orders.length === cust.count, `${all.orders.length} order(s)${row.checks.includes("doubleTap") ? " after a double tap" : row.checks.includes("dropAtConfirm") ? " after a lost answer and a second press" : ""}`));

      // 4. what the shop stored and the admin sees
      const o = await x.call("order", { number: r.number });
      out.push(check(`${row.lines} line(s)`, o.items.length === row.lines, `${o.items.length} lines`));
      if (spec.qty) out.push(check(`quantity ${spec.qty}`, o.items[0]?.quantity === spec.qty, `${o.items[0]?.quantity ?? "—"}`));
      if (p.how === "cod") out.push(check("cash on delivery: the rider collects the order's due", o.paymentMethod === "COD" && o.dueMinor === o.totalMinor - o.paidMinor && o.dueMinor > 0, `${o.paymentMethod}, due ${o.dueMinor} of ${o.totalMinor}`));
      else out.push(check("paid ahead: nothing due at the door", o.dueMinor === 0, `due ${o.dueMinor}`));
      if (row.lang === "bn") out.push(check("the order is in Bengali", o.lang === "bn", String(o.lang)));
      if (row.checks.includes("noBlock")) out.push(check("no automatic block (a person decides)", !CLOSED.includes(o.status), o.status));
      if (row.checks.includes("addressUnclear")) out.push(check("never held over the address (PR 563)", !CLOSED.includes(o.status), `${o.status}${o.addressUnclear ? ", in the address queue" : ""}`));
      if (row.checks.includes("couponRefused")) out.push(refusedCheck(codeAnswer, o));
      if (ownerCode) out.push(codeAnswer ? check("the owner's coupon answers (taken with a discount, or refused with a reason)", o.couponApplied ? o.discountMinor > 0 : !codeAnswer.ok && !!codeAnswer.error, o.couponApplied ? `discount ${o.discountMinor}` : String(codeAnswer.error)) : skip("the owner's coupon", "the code box was not reached"));
      if (repeat) {
        const ids = [repeat.customerId, o.customerId];
        out.push(ids.every((v) => !v) ? skip("one customer for the repeat buyer", "the shop keeps no customer record for these orders") : check("one customer for the repeat buyer", ids[0] === ids[1], ids[0] === ids[1] ? "the same customer" : "two customers"));
      }
      memory.last = { customer: cust, customerId: o.customerId };

      // 5. a cancel before packing (the shop declines or the buyer asks): stock released; else the booking
      if (row.checks.includes("cancel")) {
        const ids = items.map((v) => v.id);
        const before = await x.call("stock", { variantIds: ids });
        await x.call("cancel", { number: r.number, note: `simulation order ${row.n}: cancelled before packing as the plan says` });
        const after = await x.call("stock", { variantIds: ids });
        const o2 = await x.call("order", { number: r.number });
        const qty = spec.qty ?? 1;
        out.push(check("cancelled before packing", o2.status === "CANCELLED", o2.status));
        out.push(check("the stock is released", ids.every((id) => after[id] === before[id] + qty), ids.map((id) => `${before[id]}→${after[id]}`).join(", ")));
      } else if (c.book) {
        if (x.canBook) out.push(skip("booked", x.canBook));
        else {
          const b = await x.call("book", { number: r.number });
          if (b.booked) x.booked(r.number, b);
          const due = o.dueMinor;
          out.push(check("booked with the courier", !!b.booked, b.booked ? c.note : `${b.code ?? b.outcome ?? ""} ${b.error ?? ""}`.trim()));
          if (b.booked) {
            out.push(check("the courier collects the order's due", b.courier?.codMinor === due, `${b.courier?.codMinor ?? "—"} vs due ${due}`));
            out.push(b.sticker ? check("the sticker says collect the order's due", b.sticker.collectMinor === due, `${b.sticker.collectMinor} vs due ${due}`) : skip("the sticker", b.stickerError ?? "not printed"));
          }
        }
      }
      return out.length ? out : [skip("run", no(r) ?? "nothing to check")];
    },
  };
}

export const SCENARIOS = PLAN_DATA.rows.map(rowScenario);

/** The simulation has no gate checks of its own (the go-live gate's six are gate-orders' plan). */
export const GATE_CHECKS = {};

/** all, or the orders named (1–70); an unknown number is named, never guessed. */
export function pickScenarios(asked, list = SCENARIOS) {
  const s = String(asked ?? "all").trim().toLowerCase();
  if (!s || s === "all") return { picked: list, unknown: [] };
  const ids = [...new Set(s.split(/[\s,]+/).filter(Boolean).map((v) => String(Number(v) || v)))];
  return { picked: list.filter((x) => ids.includes(x.id)), unknown: ids.filter((id) => !list.some((x) => x.id === id)) };
}

export const unreachedGate = (id, what) => ({ id, what, verdict: "SKIP", detail: "not part of the simulation" });

/** What shop.mjs needs of a plan (tools/gate-orders/shop.mjs planOf). */
export const PLAN = { kind: "simulation", SCENARIOS, GATE_CHECKS, pickScenarios, unreachedGate, coverageGoal: false, range: `1–${PLAN_DATA.rows.length}`, reset: resetMemory };
