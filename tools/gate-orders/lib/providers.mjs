// PR 414 follow-up (CN-013 go-live gate phase 2) — what a real connection the owner has switched on means for a gate
// run that places test orders. Pure. The run itself never calls a provider (the oracle runs every connection on its mock),
// but the live shop uses its own connections for the orders the browser places:
// - a real SMS, WhatsApp or e-mail gateway would send the test customers real messages, and a real ERP would get real
//   test orders: no order is placed at all, every scenario is a SKIP;
// - a real payment gateway would take the prepaid scenarios to a real payment page: those are a SKIP;
// - a real courier would be asked about the test parcels by the shop's own tracking: nothing is booked, and the checks
//   that need a booked parcel (the courier and sticker columns, gate checks 1, 4, 23, 24) are a SKIP.

const MESSAGE_KINDS = new Set(["SMS", "WHATSAPP", "EMAIL"]);

/** `live` = [{kind, provider}] of the connections switched on in SANDBOX or LIVE mode. */
export function providerPolicy(live = []) {
  const kinds = new Set(live.map((p) => String(p.kind).toUpperCase()));
  const named = (pred) => live.filter((p) => pred(String(p.kind).toUpperCase())).map((p) => `${p.kind} (${p.provider})`).join(", ");
  const msg = [...kinds].some((k) => MESSAGE_KINDS.has(k));
  const blockAll = msg || kinds.has("ERP")
    ? `a real connection is switched on for ${named((k) => MESSAGE_KINDS.has(k) || k === "ERP")}: a test order would reach it, so no order is placed`
    : null;
  return {
    blockAll,
    prepaid: kinds.has("PAYMENT") ? `a real payment gateway is switched on (${named((k) => k === "PAYMENT")}): the prepaid checks are not run` : null,
    booking: kinds.has("COURIER") ? `a real courier is switched on (${named((k) => k === "COURIER")}): no test parcel is booked` : null,
  };
}
