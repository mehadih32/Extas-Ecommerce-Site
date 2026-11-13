// S28 · PR 667 (registry v294): the With courier watch — never owner data, labelled in both languages, the alert off, 48 hours.
import { describe, expect, it } from "vitest";
import { lookup, messages } from "../src/messages";
import { registry } from "../src/registry";
import { courierWatchSettings } from "../src/registry-courier-watch";

describe("courier watch setting (v294)", () => {
  it("fulfilment.courierWatch is in the registry at version 294, labelled in both languages, alert off, 48 hours, no backup", () => {
    const spec = courierWatchSettings["fulfilment.courierWatch"];
    expect(registry["fulfilment.courierWatch"]).toBe(spec);
    expect(spec.version).toBe(294);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toEqual({
      stuckAlert: false,
      stuckHours: 48,
      backupCourierId: "",
    });
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    for (const lang of ["en", "bn"] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
  });
  it("the hours are whole numbers from 1 to 720 and the backup is a courier id or empty text", () => {
    const s = courierWatchSettings["fulfilment.courierWatch"].schema;
    expect(
      s.safeParse({ stuckAlert: true, stuckHours: 1, backupCourierId: "" })
        .success,
    ).toBe(true);
    expect(
      s.safeParse({ stuckAlert: true, stuckHours: 0, backupCourierId: "" })
        .success,
    ).toBe(false);
    expect(
      s.safeParse({ stuckAlert: true, stuckHours: 721, backupCourierId: "" })
        .success,
    ).toBe(false);
    expect(
      s.safeParse({ stuckAlert: true, stuckHours: 48, backupCourierId: "x" })
        .success,
    ).toBe(false);
  });
});
