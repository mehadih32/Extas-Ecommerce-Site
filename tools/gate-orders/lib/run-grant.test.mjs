// PR 414 follow-up (live run 1 Nov) — the browser half of the run's mock-payment grant.
import { describe, expect, it } from "vitest";
import { COD_OFF, GATE_RUN_COOKIE, payWay, runCookie } from "./run-grant.mjs";

const token = "c".repeat(64);

describe("runCookie", () => {
  it("is HttpOnly, on the preview host only, Secure on https", () => {
    expect(runCookie("https://new.example.test", "20261101", token)).toEqual({ name: GATE_RUN_COOKIE, value: `20261101.${token}`, domain: "new.example.test", path: "/", httpOnly: true, secure: true, sameSite: "Lax", expires: -1 });
    expect(runCookie("http://127.0.0.1:3106", "local1", token)?.secure).toBe(false);
  });
  it("no token, a bad run id or a bad address: no cookie", () => {
    expect(runCookie("https://new.example.test", "20261101", "")).toBeNull();
    expect(runCookie("https://new.example.test", "a;b", token)).toBeNull();
    expect(runCookie("not an address", "20261101", token)).toBeNull();
  });
});

describe("payWay", () => {
  const open = { open: true };
  it("cash on delivery first while it is on (the owner's switch, or allow_cod)", () => {
    expect(payWay({ cod: true, mobileBkash: true, testPayments: false, grant: open })).toEqual({ pay: "cod", canPrepay: null, why: null });
  });
  it("COD off: the mock bKash through the run's own grant (test payments stay off for everyone)", () => {
    expect(payWay({ cod: false, mobileBkash: true, testPayments: false, grant: open }).pay).toBe("bkash");
  });
  it("COD off and the grant closed: nothing to pay with, and both reasons named", () => {
    const w = payWay({ cod: false, mobileBkash: true, testPayments: false, grant: { open: false, why: "this host is one the shop sells on" } });
    expect(w.pay).toBeNull();
    expect(w.why).toContain(COD_OFF);
    expect(w.why).toContain("this host is one the shop sells on");
  });
  it("a live payment connection or no bKash tile: never paid ahead", () => {
    expect(payWay({ cod: false, mobileBkash: true, testPayments: true, grant: open, prepaidBlock: "a real gateway is on" }).canPrepay).toBe("a real gateway is on");
    expect(payWay({ cod: false, mobileBkash: false, testPayments: true, grant: open }).pay).toBeNull();
  });
});
