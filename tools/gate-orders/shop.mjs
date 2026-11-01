#!/usr/bin/env node
// PR 414 follow-up (CN-013 go-live gate phase 2; owner's OK of 1 Nov 2026) — the go-live test-order run in real
// browsers against the preview site: phones and desktops on throttled networks place real test orders through the
// storefront (baskets of 1, 3 and 8 pieces, one customer's month of orders with cancels, Bengali, wrong details, double
// taps, a dropped network, a race for the last piece …), each to its own real-world address; the oracle
// (server/oracle.ts) does the admin's half with the shop's own package functions on the mocks. Every order's name, phone
// and address is compared as typed, as stored, as the admin shows it, as the (mock) courier was sent it and as the
// sticker prints it. At the end every test order is cancelled through the normal path and the test products archived
// (nothing deleted), and the report goes to $GATE_OUT/README.md and result.json (infra/deploy/gate-orders.sh;
// .github/workflows/gate-orders.yml, by hand only).
//
// env: BASE (the shop's address: https on the preview host), GATE_PREVIEW_HOST (server.conf's EXTAS_STAGING_HOST),
//      GATE_EXTRA_HOSTS (server.conf's EXTAS_EXTRA_HOSTS: hosts the shop sells on), GATE_ORACLE_URL, GATE_ORACLE_TOKEN,
//      GATE_SCENARIOS (all | 1,5,7), GATE_OUT, GATE_RUN_ID, GATE_SHA, GATE_AT, GATE_LHRC (lighthouserc.json),
//      SMOKE_HTTP_USER / SMOKE_HTTP_PASSWORD (the preview login), GATE_PAY_TOKEN (the run's random token: its own
//      browser's cookie for the run's mock-payment grant, lib/run-grant.mjs), CHROMIUM_PATH (optional), GATE_LOOPBACK=1
//      (a developer's local proof on 127.0.0.1 only; never set on the server).
// Live run 1 Nov: cash on delivery is the owner's switch and the practice gateway's page is closed for everyone, so the
// run pays on the mock bKash through its own grant (the oracle's openRun; closed by the clean-up and the shell's trap),
// and a scenario that needs cash on delivery is a SKIP ("COD is off (owner's setting)") unless the owner ran it with
// `allow_cod`.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { previewCookie } from "../smoke.mjs";
import { addressDiffs, placeFails, placeVerdict } from "./lib/compare.mjs";
import { baseOf, hostGuard, hostList } from "./lib/host-guard.mjs";
import { oracleClient } from "./lib/oracle-client.mjs";
import { classOf, networkOf } from "./lib/profiles.mjs";
import { providerPolicy } from "./lib/providers.mjs";
import { COD_OFF, payWay, runCookie } from "./lib/run-grant.mjs";
import { writeReport } from "./lib/report.mjs";
import { addItem, choosePay, fillDetails, inLang, openCheckout, openShopper, payPage, pickZone, setQuantity, submit, timedGoto } from "./lib/shopper.mjs";
import { addressBook, coverage, DATA, PHONE_FORMATS, seedOf, testName, testPhone, typedPhone } from "./lib/test-data.mjs";
import { budgetOf, overBudget, scenarioVerdict, skip } from "./lib/verdict.mjs";
import { GATE_CHECKS, pickScenarios, SCENARIOS, unreachedGate } from "./scenarios.mjs";

const require = createRequire(import.meta.url);
const log = (s) => console.log(`[gate-orders ${new Date().toISOString().slice(11, 19)}] ${s}`);
/** An error in one line; a browser step's own error also names what it waited for (the storefront's selector). */
const errLine = (e) => {
  const lines = String(e instanceof Error ? e.message : e).split("\n");
  const on = lines.map((l) => /waiting for (locator\(.*\)(?: to be \w+)?|navigation.*)$/.exec(l.replace(/\x1b\[[0-9;]*m/g, ""))?.[1]).find(Boolean);
  return `${lines[0]}${on ? ` (${on})` : ""}`.slice(0, 300);
};

/** The variants of the test products, handed out so that no two scenarios fight over one piece's stock. */
export function variantPool(products) {
  const all = products.flatMap((p) => p.variants.map((v) => ({ ...v, product: p.key, slug: p.slug })));
  const byKey = (pk, colour, size) => all.find((v) => v.product === pk && v.colour.endsWith(colour) && v.size.endsWith(size));
  // two pieces kept for the stock scenarios (their stock is set by the run): the last-piece one and the race one
  const reserved = { lastPiece: byKey("polo", "white", "xl") ?? all[0], race: byKey("shirt", "navy", "xl") ?? all[1] };
  const free = all.filter((v) => v !== reserved.lastPiece && v !== reserved.race);
  let i = 0;
  return {
    reserved,
    /** n different pieces (round the free list; a run with more orders than pieces reuses them, never the reserved ones). */
    take: (n) => Array.from({ length: n }, () => free[i++ % free.length]),
    polos: (n) => free.filter((v) => v.product === "polo").slice(0, n),
  };
}

/** The whole run; whatever happens, the report is written (a crash is a problem line, never a missing report). */
export async function runGate(env = process.env) {
  const at = env.GATE_AT || new Date().toISOString();
  const run = { at, sha: env.GATE_SHA || "", host: "", asked: env.GATE_SCENARIOS || "all", rows: [], gateChecks: [], addressRows: [], problems: [], cleanup: null, providers: null, budget: null, coverage: null };
  const secrets = [env.GATE_ORACLE_TOKEN, env.SMOKE_HTTP_PASSWORD, env.GATE_PAY_TOKEN];
  const STOPPED = 1; // the exit of a run that crashed (as a failed scenario)
  let exit;
  try {
    exit = await gateRun(env, run, secrets);
  } catch (e) {
    run.problems.push(`the run stopped: ${errLine(e)}`);
    exit = STOPPED;
  }
  if (env.GATE_OUT) writeReport(env.GATE_OUT, run, secrets);
  return exit;
}

async function gateRun(env, run, secrets) {
  const runId = String(env.GATE_RUN_ID || run.at.replace(/\D/g, "").slice(0, 12));
  const finish = (code) => code;

  // ---- 1. the host guard (server.conf), before anything else ----
  let target;
  try {
    target = new URL(env.BASE ?? "").hostname;
  } catch {
    target = "";
  }
  const loopback = env.GATE_LOOPBACK === "1";
  const first = hostGuard({ target, preview: env.GATE_PREVIEW_HOST, live: hostList(env.GATE_EXTRA_HOSTS) });
  const base = first.ok ? baseOf(env.BASE, first.host, { loopback }) : null;
  if (!first.ok || !base) {
    run.problems.push(`refused to start: ${first.why ?? "the shop's address is not https on the preview host"}`);
    log(run.problems[0]);
    return finish(1);
  }
  run.host = first.host;
  try {
    run.budget = budgetOf(JSON.parse(readFileSync(env.GATE_LHRC || new URL("../../lighthouserc.json", import.meta.url), "utf8")));
  } catch {
    run.problems.push("the speed budget (lighthouserc.json) could not be read: timings are shown without flags");
  }

  // ---- 2. the oracle: the shop's own guard facts and the live providers ----
  const oracle = oracleClient(env.GATE_ORACLE_URL, env.GATE_ORACLE_TOKEN);
  if (!(await oracle.ready())) {
    run.problems.push("the oracle (the shop's own side) did not start");
    return finish(1);
  }
  // read only: nothing is written on the shop before the guard below has passed
  const f = await oracle.call("facts");
  const guard = hostGuard({ target, preview: env.GATE_PREVIEW_HOST, saved: f.facts.saved, live: [...hostList(env.GATE_EXTRA_HOSTS), ...hostList(f.facts.storeHosts)] });
  if (!guard.ok) {
    run.problems.push(`refused to start: ${guard.why}`);
    return finish(1);
  }
  run.providers = f.facts.providers;
  const policy = providerPolicy(f.facts.providers.live);
  const sw = f.switches;
  // an earlier run's open test orders are cancelled first (on the mocks), whatever this run can do
  let prep = await oracle.call("prepare", { setUp: false }, { timeoutMs: 300_000 });
  const { picked, unknown } = pickScenarios(env.GATE_SCENARIOS);
  for (const id of unknown) run.problems.push(`no scenario "${id}" (the list is 1–18)`);
  if (prep.leftovers?.cancelled) run.problems.push(`an earlier run left ${prep.leftovers.cancelled} open test order(s): cancelled first`);
  if (prep.earlierRuns?.closed) run.problems.push(`an earlier run left its mock-payment grant open: closed first${prep.earlierRuns.codRestored ? " and cash on delivery put back" : ""}`);
  for (const n of prep.earlierRuns?.notes ?? []) run.problems.push(n);
  // the run's own mock-payment grant (its browser only, on the preview host), and cash on delivery only with allow_cod
  const grant = policy.blockAll || !picked.length ? null : await oracle.call("openRun").catch((e) => ({ open: false, why: errLine(e), cod: { on: false, changed: false } }));
  const payCookie = grant?.open ? runCookie(base, runId, env.GATE_PAY_TOKEN) : null;
  run.payment = { mockPay: grant?.open ? "the run's own grant: its browser only, on the preview host, closed at the end" : `no grant (${grant?.why ?? "not asked"})`, cod: sw.cod ? "on (the owner's setting)" : grant?.cod?.changed ? "switched on for this run only (allow_cod, the owner's OK) and put back at the end" : COD_OFF };
  const mobileBkash = sw.mobile.enabled && sw.mobile.list.includes("bkash");
  const way = payWay({ cod: sw.cod || grant?.cod?.on === true, mobileBkash, testPayments: sw.testPayments, grant: grant && !payCookie ? { open: false, why: "the run has no token (GATE_PAY_TOKEN)" } : grant, prepaidBlock: policy.prepaid ?? null });
  const { pay, canPrepay } = way;

  if (policy.blockAll || !pay || !picked.length) {
    const why = policy.blockAll ?? (!pay ? way.why : "no scenario asked");
    for (const s of picked) run.rows.push({ id: s.id, title: s.title, device: s.device, network: s.network, verdict: "SKIP", orders: [], addresses: [], checks: [skip("run", why)], timed: [] });
    for (const [id, what] of Object.entries(GATE_CHECKS)) run.gateChecks.push({ id, what, verdict: "SKIP", detail: why });
    const closed = grant ? await oracle.call("closeRun").catch((e) => ({ ok: false, notes: [errLine(e)] })) : { ok: true, notes: [] };
    run.cleanup = { ...prep.leftovers, ok: (prep.leftovers?.ok ?? true) && closed.ok !== false, productsArchived: 0, extrasArchived: 0, salesOk: true, salesDetail: "no order placed", notes: closed.notes ?? [] };
    return finish(0);
  }

  // ---- 3. the GATE TEST products, then the scenarios in real browsers ----
  run.started = true;
  prep = await oracle.call("prepare", { setUp: true }, { timeoutMs: 300_000 });
  const pool = variantPool(prep.setUp.products);
  const pathOf = (v) => `${sw.pathPrefix || "/p"}/${v.slug}`.replace(/\/{2,}/g, "/");
  const book = addressBook();
  const seed = seedOf(runId);
  let customers = 0;
  let orderSeq = 0;
  const since = new Date(Date.now() - 5_000).toISOString(); // this run's orders only (a few seconds for the clocks)
  const placed = new Map(); // number → {typed, address, scenario, booked}
  const gates = new Map();
  const { chromium } = require("playwright");
  const browser = await chromium.launch(env.CHROMIUM_PATH ? { executablePath: env.CHROMIUM_PATH } : {});
  const httpCredentials = env.SMOKE_HTTP_USER ? { username: env.SMOKE_HTTP_USER, password: env.SMOKE_HTTP_PASSWORD ?? "" } : null;
  const state = httpCredentials ? await previewCookie(browser, base, httpCredentials).catch(() => null) : null;
  const shoppers = [];

  try {
    for (const s of picked) {
      const row = { id: s.id, title: s.title, device: s.device, network: s.network, verdict: "SKIP", orders: [], addresses: [], checks: [], timed: [], timings: null, over: [] };
      run.rows.push(row);
      // a scenario about cash on delivery waits for the owner's switch (or a run with allow_cod)
      if (s.cod && pay !== "cod") {
        row.checks = [skip("run", COD_OFF)];
        for (const id of s.gates ?? []) gates.set(String(id), { id: String(id), what: GATE_CHECKS[id], verdict: "SKIP", detail: COD_OFF });
        continue;
      }
      log(`scenario ${s.id}: ${s.title} (${s.device}, ${s.network})`);
      const x = {
        base,
        sw,
        pay,
        canPrepay,
        canBook: policy.booking,
        since,
        reserved: pool.reserved,
        weightCheckGrams: DATA.weightCheckGrams,
        v: (n) => pool.take(n),
        polos: (n) => pool.polos(n),
        call: (a, b) => oracle.call(a, b),
        secret: (v) => secrets.push(v),
        name: (n, lang = "en") => testName(n, lang),
        newCustomer: () => {
          customers += 1;
          return { n: customers, phone: testPhone(seed, customers) };
        },
        gate: (id, c) => gates.set(String(id), { id: String(id), what: GATE_CHECKS[id], verdict: c.verdict, detail: c.detail }),
        booked: (number, facts) => {
          const p = placed.get(number);
          if (p && facts?.booked !== false) p.booked = facts;
        },
        track: (number, r) => {
          if (!placed.has(number)) placed.set(number, { typed: r.typed, address: r.address, scenario: s.id, booked: null });
          if (!row.orders.includes(number)) row.orders.push(number);
          if (!row.addresses.includes(r.address.id)) row.addresses.push(r.address.id);
        },
        async open(device, network, opts = {}) {
          const sh = await openShopper(browser, { device, network, storageState: state, httpCredentials, cookies: payCookie ? [payCookie] : [], ...opts });
          shoppers.push(sh);
          return sh;
        },
        async add(sh, v) {
          return addItem(sh, base, { path: pathOf(v), colour: v.colour, size: v.size });
        },
        async ready(sh, spec) {
          const address = typeof spec.address === "object" && spec.address?.id ? spec.address : book.take(spec.address ?? "dhaka");
          const c = spec.customer ?? x.newCustomer();
          orderSeq += 1;
          const format = spec.phoneFormat ?? PHONE_FORMATS[orderSeq % PHONE_FORMATS.length];
          const lang = spec.lang ?? "en";
          const typed = { name: testName(c.n, lang === "bn" ? "bn" : "en"), phone: typedPhone(c.phone, format), address: address.text, localPhone: c.phone, format };
          const timings = {};
          if (spec.timed) timings.firstLoad = await timedGoto(sh, `${base}${inLang(lang, "/")}`);
          for (const [i, v] of spec.items.entries()) {
            const a = await addItem(sh, base, { path: pathOf(v), colour: v.colour, size: v.size }, lang);
            if (a.lostTaps) row.lostTaps = (row.lostTaps ?? 0) + a.lostTaps;
            if (i === 0) {
              timings.productPage = a.pdp;
              if (a.press) timings.addToBag = a.press;
            }
            if (!a.ok) return { ok: false, sh, typed, address, error: `the bag refused a piece: ${a.error}` };
          }
          if (spec.beforeCheckout) await spec.beforeCheckout(sh);
          timings.checkoutOpen = await openCheckout(sh, base, lang, { gift: !!spec.gift });
          if (spec.qty > 1) await setQuantity(sh, spec.qty);
          if (spec.gift) {
            await sh.page.locator('[data-testid="co-gift-from"]').fill(spec.gift.from);
            await sh.page.locator('[data-testid="co-gift-contact"]').fill(spec.gift.contact);
          }
          if (spec.beforeDetails) await spec.beforeDetails(sh, typed);
          await fillDetails(sh, typed);
          const zone = await pickZone(sh, address.pick ?? address.band);
          const how = spec.pay ?? pay;
          const why = await choosePay(sh, how);
          if (why) return { ok: false, sh, typed, address, skip: why };
          return { ok: true, sh, typed, address, timings, zone, how };
        },
        /** After a submit that landed on the mock payment page: approves it there (null when no payment was asked). */
        async settle(sh, p) {
          if (!/\/checkout\/pay\//.test(p?.url ?? "")) return null;
          return payPage(sh, "approve");
        },
        async order(sh, spec) {
          const r = await x.ready(sh, spec);
          if (!r.ok) return r;
          if (spec.beforeSubmit) {
            await spec.beforeSubmit(sh, r.typed, r.address);
            await choosePay(sh, r.how);
          }
          const p = await submit(sh, spec.submitOpts ?? {});
          const number = p.answer?.ok ? p.answer.number : null;
          const saw = p.unanswered ? ` (the Confirm button was ${p.unanswered.off ? "off" : "on"}${p.unanswered.field ? `; the form pointed at ${p.unanswered.field}` : ""})` : "";
          if (!number) return { ...r, error: `the checkout answered ${p.answer?.error ?? "nothing"}${p.answer?.field ? ` (${p.answer.field})` : ""}${saw}` };
          r.timings.submit = { ms: p.ms, serverMs: p.serverMs, lcpMs: p.lcpMs };
          x.track(number, r);
          // with cash on delivery off the run pays on the mock bKash page, as the customer does (a scenario that names
          // its own way to pay drives that page itself)
          if (spec.pay === undefined) {
            const paid = await x.settle(sh, p);
            if (paid?.skip) return { ...r, number, next: p.url, error: `the order is placed but not paid: ${paid.skip}` };
          }
          if (spec.timed) {
            const t = { cls: classOf(sh.device), network: sh.network, timings: r.timings };
            row.timed.push(t);
            row.timings ??= r.timings;
            if (networkOf(sh.network).budget) row.over.push(...overBudget(r.timings, run.budget));
          }
          return { ...r, number, next: p.url };
        },
      };
      try {
        row.checks = await s.run.call(s, x);
      } catch (e) {
        row.checks.push({ id: "run", verdict: "FAIL", detail: errLine(e) });
        log(`scenario ${s.id}: ${errLine(e)}`);
      }
      row.verdict = scenarioVerdict(row.checks);
      if (row.lostTaps) run.problems.push(`scenario ${s.id}: ${row.lostTaps} tap(s) landed before the product page had woken up and did nothing (the shopper tapped again)`);
      while (shoppers.length) await shoppers.pop().close().catch(() => null);
    }

    // ---- 4. every order's details at every stage: typed, stored, admin, courier, sticker ----
    for (const [number, p] of placed) {
      try {
        let o = await oracle.call("order", { number });
        if (!p.booked && !policy.booking && ["PLACED", "CONFIRMED"].includes(o.status)) {
          const b = await oracle.call("book", { number }).catch((e) => ({ booked: false, error: errLine(e) }));
          if (b.booked) p.booked = b;
          o = await oracle.call("order", { number });
        }
        const stages = { stored: o.stored, admin: o.admin, courier: p.booked?.courier ?? null, sticker: p.booked?.sticker ?? null };
        const diffs = addressDiffs(p.typed, stages, { backfilled: o.backfilled });
        const place = placeVerdict(p.address.expect, o.areaCode);
        const ok = diffs.length === 0 && !placeFails(place);
        run.addressRows.push({ number, addressId: p.address.id, quirk: p.address.quirk ?? "", phoneFormat: p.typed.format, stages, diffs, place, band: o.band ? `${o.band.key} · ${o.deliveryChargeMinor}` : null, verdict: ok ? "PASS" : "FAIL" });
      } catch (e) {
        run.addressRows.push({ number, addressId: p.address.id, quirk: p.address.quirk ?? "", phoneFormat: p.typed.format, stages: {}, diffs: [], place: "UNREAD", band: null, verdict: "FAIL" });
        run.problems.push(`order ${number}: ${errLine(e)}`);
      }
    }
    run.coverage = coverage(book.used().map((id) => DATA.addresses.find((a) => a.id === id)));
    // the owner's ask: every division and 12+ districts outside Dhaka (said when a full run fell short)
    const goal = DATA.coverageGoal;
    if (picked.length === SCENARIOS.length && (run.coverage.divisions.length < goal.divisions || run.coverage.outsideDistricts.length < goal.outsideDistricts)) {
      run.problems.push(`the addresses reached ${run.coverage.divisions.length} of ${goal.divisions} divisions and ${run.coverage.outsideDistricts.length} districts outside Dhaka (asked: ${goal.outsideDistricts} or more)`);
    }
    // an address row that fails fails its scenario too
    for (const a of run.addressRows.filter((r) => r.verdict === "FAIL")) {
      const row = run.rows.find((r) => r.orders.includes(a.number));
      if (row) {
        row.checks.push({ id: `address ${a.number}`, verdict: "FAIL", detail: a.diffs.length ? a.diffs.map((d) => `${d.stage}.${d.field}`).join(", ") : `place ${a.place}` });
        row.verdict = scenarioVerdict(row.checks);
      }
    }
    for (const [id, what] of Object.entries(GATE_CHECKS)) run.gateChecks.push(gates.get(id) ?? unreachedGate(id, what, picked.map((s) => s.id)));
  } finally {
    await browser.close().catch(() => null);
    // ---- 5. the clean-up: every test order cancelled, the test products archived; then the sales check ----
    try {
      run.cleanup = await oracle.call("cleanup", {}, { timeoutMs: 600_000 });
      const s = await oracle.call("sales", { since, numbers: [...placed.keys()] });
      run.cleanup.salesOk = s.countedAsSales.length === 0 && s.gateSkusSold === 0;
      run.cleanup.salesDetail = `${s.countedAsSales.length} test orders counted as sales, ${s.gateSkusSold} test pieces in sales by SKU (delivered only)`;
    } catch (e) {
      run.problems.push(`clean-up: ${errLine(e)}`);
    }
  }
  const failed = run.rows.some((r) => r.verdict === "FAIL") || run.gateChecks.some((g) => g.verdict === "FAIL") || !run.cleanup?.ok;
  return finish(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGate().then(
    (code) => {
      log(code === 0 ? "done" : "done with failures (see the report)");
      process.exit(code);
    },
    (e) => {
      console.error(`gate-orders: FAILED — ${errLine(e)}`);
      process.exit(1);
    },
  );
}
