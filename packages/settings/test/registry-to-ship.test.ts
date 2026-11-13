// S28 · PR 666 (registry v293): the To ship switches — never owner data, labelled in both languages, both off as shipped.
import { describe, expect, it } from "vitest";
import { lookup, messages } from "../src/messages";
import { registry } from "../src/registry";
import { toShipSettings } from "../src/registry-to-ship";

describe("To ship settings (v293)", () => {
  it("fulfilment.toShip is in the registry at version 293, labelled in both languages, both switches off", () => {
    const spec = toShipSettings["fulfilment.toShip"];
    expect(registry["fulfilment.toShip"]).toBe(spec);
    expect(spec.version).toBe(293);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toEqual({ reprintPin: false, packOnPrint: false });
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    expect(spec.schema.safeParse({ reprintPin: true }).success).toBe(false);
    for (const lang of ["en", "bn"] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
  });
});
