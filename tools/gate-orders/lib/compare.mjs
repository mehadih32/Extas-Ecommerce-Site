// PR 414 follow-up (CN-013 go-live gate phase 2) — the address round trip of a test order. Pure. Each order's row puts
// what the customer typed beside what the shop stored, what the admin shows, what the (mock) courier was sent and what
// the sticker prints; any difference is a FAIL. Only spacing is forgiven (a pasted address's line breaks, a double
// space): words, digits, Bengali letters and punctuation must arrive exactly. A phone number is compared as the number
// it is (Bengali digits, +880, 880 and dashes are the same number), the way the shop's one normaliser reads it.

/** Bengali digits as Latin digits. */
const latin = (s) => String(s).replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6));

/** The text with its spacing made plain (Unicode NFC, every run of spaces and line breaks one space, trimmed). */
export const plainText = (s) => (s === null || s === undefined ? null : String(s).normalize("NFC").replace(/\s+/gu, " ").trim());

/** The local 11-digit mobile number (01XXXXXXXXX) of a phone as typed or stored, or null when it is not one. */
export function localPhone(raw) {
  if (raw === null || raw === undefined) return null;
  let d = latin(raw).replace(/\D/g, "");
  if (d.startsWith("00880")) d = d.slice(2);
  if (d.startsWith("880")) d = d.slice(2);
  if (d.length === 10 && /^1[3-9]/.test(d)) d = `0${d}`;
  return /^01[3-9]\d{8}$/.test(d) ? d : null;
}

/** The places an order's details travel to, in the row's order. */
export const STAGES = ["stored", "admin", "courier", "sticker"];
export const FIELDS = ["name", "phone", "address"];

const same = (field, a, b) => (field === "phone" ? localPhone(a) !== null && localPhone(a) === localPhone(b) : plainText(a) === plainText(b));

/**
 * The differences between what was typed and each stage it reached. `typed` = {name, phone, address}; `stages` =
 * {stored, admin, courier, sticker}, each {name, phone, address} or null when that stage was not reached (skipped,
 * e.g. no courier booking on this run). A stage that was reached but lost a field is a difference too.
 */
export function addressDiffs(typed, stages, { backfilled = null } = {}) {
  const out = [];
  for (const stage of STAGES) {
    const got = stages?.[stage];
    if (!got) continue;
    for (const field of FIELDS) {
      // PR 561: with the owner's backfill on, the parcel goes to the full address the shop holds for the number (the
      // stored order keeps what he typed); the courier and the sticker are compared with that one
      const want = field === "address" && backfilled && (stage === "courier" || stage === "sticker") ? backfilled : typed[field];
      if (!same(field, want, got[field])) out.push({ stage, field, typed: want ?? null, got: got[field] ?? null });
    }
  }
  return out;
}

/** OK | WIDER | OTHER | WRONG | UNREAD: how the shop's resolver read the place against the test data's expectation. */
export function placeVerdict(expect, areaCode) {
  if (!areaCode) return "UNREAD";
  const inside = (code, root) => code === root || code.startsWith(`${root}.`);
  if (!inside(areaCode, expect.district)) return "WRONG";
  if (expect.places === null) return "OK";
  if (expect.places.some((p) => inside(areaCode, p))) return "OK";
  // read only as far as the district (or an upazila above the thana): less exact, not wrong
  if (expect.places.some((p) => p.startsWith(`${areaCode}.`))) return "WIDER";
  return "OTHER";
}

/** A place verdict that fails the row: the address landed in another district. The rest are findings. */
export const placeFails = (v) => v === "WRONG";

/** One line for the report: where the order's details went wrong, without any customer's details beyond the test data. */
export function diffLine(d) {
  const show = (v) => (v === null ? "(missing)" : JSON.stringify(plainText(v)).slice(0, 80));
  return `${d.stage}.${d.field}: typed ${show(d.typed)} → ${show(d.got)}`;
}
