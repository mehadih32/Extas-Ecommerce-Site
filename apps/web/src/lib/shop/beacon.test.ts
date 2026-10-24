// PR 104 — every fetch the shop does not wait for reads its answer (lib/shop/beacon.ts says why).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { beacon } from "./beacon";

const src = join(__dirname, "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("fire-and-forget requests (PR 104)", () => {
  it("reads the answer and drops it", async () => {
    const text = vi.fn(async () => '{"ok":true}');
    const fetchMock = vi.fn(async () => ({ text }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    beacon("/api/shop/combo", { method: "POST", body: "{}" });
    await vi.waitFor(() => expect(text).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/shop/combo", {
      keepalive: true,
      method: "POST",
      body: "{}",
    });
    vi.unstubAllGlobals();
  });

  it("no page leaves a `void fetch(…)` answer unread", () => {
    const bad: string[] = [];
    for (const f of files(src)) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/void fetch\(/g)) {
        const rest = text.slice(m.index);
        const end = rest.search(/\.catch\(|;\s*$/m);
        if (!/\.then\(/.test(rest.slice(0, end < 0 ? undefined : end)))
          bad.push(
            `${f.slice(src.length + 1)}:${text.slice(0, m.index).split("\n").length}`,
          );
      }
    }
    expect(
      bad,
      "read the answer (.then(r => r.text())) or use beacon() from lib/shop/beacon",
    ).toEqual([]);
  });
});
