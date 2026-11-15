// PR 864 — device-gate friendly checks of the CSS this lane added: tap targets of 44 px, no fixed width wider than a phone, the heat map
// scrolls inside its own box instead of the page, the span-2 cell folds on a tablet, and no colour literal outside the --lm-* tokens.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const products = readFileSync(join(__dirname, "report-products.css"), "utf8");
const look = readFileSync(
  join(__dirname, "../../../app/admin/look.css"),
  "utf8",
);

describe("Products report CSS", () => {
  it("the reorder window fits a 390 px phone and its buttons are 44 px tall", () => {
    expect(products).toContain("width: min(420px, calc(100vw - 32px))");
    expect(products).toMatch(/\.rp-dlg-foot \.a2-btn\s*{\s*min-height: 44px/);
  });
  it("the heat map scrolls inside its own box and a cell is never narrower than a thumb", () => {
    expect(products).toMatch(/\.rp-heat-wrap\s*{\s*overflow-x: auto/);
    expect(products).toMatch(/\.rp-heat td\s*{[^}]*min-width: 44px/);
  });
  it("the span-2 cell folds to one column at tablet width", () => {
    expect(products).toMatch(
      /@media \(max-width: 1023px\)\s*{\s*\.adm2 \.rp-span2\s*{\s*grid-column: auto/,
    );
  });
  it("uses tokens for colours (no hex or rgb literal)", () => {
    expect(products).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(products).not.toMatch(/rgba?\(/);
  });
});

describe("Home CSS added by PR 862", () => {
  it("the Change target window fits a phone and its field and buttons are 44 px", () => {
    expect(look).toContain("width:min(420px,calc(100vw - 32px))");
    expect(look).toMatch(/\.a3-tgt-in input\{[^}]*min-height:44px/);
    expect(look).toMatch(/\.a3-tgt-foot \.a2-btn\{min-height:44px/);
  });
});
