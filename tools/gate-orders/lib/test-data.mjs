// PR 414 follow-up (CN-013 go-live gate phase 2) — the test-data maker of the gate runs (gate-orders, and any other gate
// run that places or reads test orders, e.g. gate-customer360). Pure: no browser, no database. Everything comes from
// tools/gate-orders/data/test-data.json (sample data only, every name marked GATE TEST); this file only hands it out
// so that no two orders of a run share an address and every phone number is a made-up test number in the format the
// scenario asks for (Latin or Bengali digits, with +880, 880 or the plain 0).
import { readFileSync } from "node:fs";

export const DATA = JSON.parse(readFileSync(new URL("../data/test-data.json", import.meta.url), "utf8"));

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** Latin digits as Bengali digits (০-৯), the rest as it is. */
export const toBengaliDigits = (s) => String(s).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);

/** Bengali digits as Latin digits. */
export const toLatinDigits = (s) => String(s).replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6));

/** The ways a customer types his number (gate: Bengali digits, +880, 880 and the plain local form). */
export const PHONE_FORMATS = ["local", "bengali", "plus880", "880", "spaced"];

/**
 * A made-up test number: 01 + operator digit + the middle block + four digits. `seed` makes each run's numbers its own;
 * `n` is the customer's number within the run (the same `n` is the same customer).
 */
export function testPhone(seed, n, data = DATA) {
  const ops = data.phone.operators;
  const tail = String((Number(seed) * 37 + Number(n) * 101) % 10_000).padStart(4, "0");
  return `01${ops[Number(n) % ops.length]}${data.phone.middle}${tail}`;
}

/** The number as the customer types it in `format` (the local 11 digits in, the typed text out). */
export function typedPhone(local, format) {
  const d = String(local);
  switch (format) {
    case "bengali":
      return toBengaliDigits(d);
    case "plus880":
      return `+88${d}`;
    case "880":
      return `88${d}`;
    case "spaced":
      return `${d.slice(0, 5)}-${d.slice(5)}`;
    default:
      return d;
  }
}

/** A short seed from the run id (digits only), so each run's numbers differ from the last run's. */
export function seedOf(runId) {
  const digits = String(runId).replace(/\D/g, "");
  return Number(digits.slice(-6) || "0");
}

/**
 * Hands out the addresses one by one (never the same twice in a run), by kind (`dhaka`, `suburb`, `outside`) or id,
 * and remembers which order took which.
 */
export function addressBook(data = DATA) {
  const used = new Set();
  const all = data.addresses;
  const usedDivisions = new Set();
  const usedDistricts = new Set();
  // the run's few orders spread over the country: a division not reached yet first, then a district not reached yet
  const spread = (list) => list.find((x) => !usedDivisions.has(x.division)) ?? list.find((x) => !usedDistricts.has(x.expect?.district)) ?? list[0];
  const take = (want) => {
    const a = typeof want === "string" && all.some((x) => x.id === want)
      ? all.find((x) => x.id === want && !used.has(x.id))
      : spread(all.filter((x) => !used.has(x.id) && (!want || (typeof want === "string" ? x.kind === want : want(x)))));
    if (!a) throw new Error(`no unused test address left for ${typeof want === "function" ? "this filter" : want ?? "any kind"}`);
    used.add(a.id);
    usedDivisions.add(a.division);
    usedDistricts.add(a.expect?.district);
    return a;
  };
  return {
    take,
    /** One of each kind the scenario names, in that order. */
    takeMany: (kinds) => kinds.map((k) => take(k)),
    used: () => [...used],
    left: () => all.filter((a) => !used.has(a.id)).length,
  };
}

/** A test customer's name (Bengali when the scenario types in Bengali). */
export function testName(n, lang = "en", data = DATA) {
  const list = data.names[lang] ?? data.names.en;
  return list[Number(n) % list.length];
}

/** The divisions and the districts outside Dhaka that a set of addresses covers (for the report's coverage line). */
export function coverage(addresses) {
  const divisions = new Set(addresses.map((a) => a.division));
  const districts = new Set(addresses.filter((a) => a.kind === "outside").map((a) => a.expect.district));
  return { divisions: [...divisions].sort(), outsideDistricts: [...districts].sort(), kinds: [...new Set(addresses.map((a) => a.kind))].sort() };
}
