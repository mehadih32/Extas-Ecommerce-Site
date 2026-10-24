// PR 602 on a real Redis (skipped without TEST_REDIS_URL): one process's purge reaches every other process (never
// itself), the hit counts of every process add up per day, and a Redis that is away fails nothing.
import { afterAll, describe, expect, it } from "vitest";
import { redisBus, type BusPurge, type CacheBus } from "./bus";

const URL = process.env.TEST_REDIS_URL ?? "";
const day = `t-${Date.now()}`;

describe.skipIf(!URL)("PR 602 · the cache over Redis", () => {
  const open: CacheBus[] = [];
  const bus = (origin: string) => {
    const b = redisBus({ url: URL, origin, day: () => day, keepDays: () => 1 });
    open.push(b);
    return b;
  };
  afterAll(async () => {
    await Promise.all(open.map((b) => b.close()));
  });

  it("a purge reaches the other processes, never its sender", async () => {
    const web = bus("web-1");
    const worker = bus("worker-1");
    const heardWeb: BusPurge[] = [];
    const heardWorker: BusPurge[] = [];
    await web.subscribe((p) => heardWeb.push(p));
    await worker.subscribe((p) => heardWorker.push(p));
    await worker.publish({ tags: ["p:1:a"], everything: false });
    await web.publish({ tags: [], everything: true });
    await new Promise((r) => setTimeout(r, 200));
    expect(heardWeb).toEqual([{ tags: ["p:1:a"], everything: false }]);
    expect(heardWorker).toEqual([{ tags: [], everything: true }]);
  });

  it("every process counts into the same day", async () => {
    const a = bus("web-a");
    const b = bus("web-b");
    a.count("page", true);
    a.count("page", true);
    b.count("page", false);
    b.count("stock", true);
    await new Promise((r) => setTimeout(r, 200));
    expect(await a.counts(day)).toEqual({
      page: { hits: 2, misses: 1 },
      stock: { hits: 1, misses: 0 },
    });
  });

  it("a Redis that is away fails nothing", async () => {
    const gone = redisBus({
      url: "redis://127.0.0.1:1",
      origin: "x",
      day: () => day,
      keepDays: () => 1,
    });
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      await gone.publish({ tags: ["a"], everything: false });
      gone.count("page", true);
      expect(await gone.counts(day)).toEqual({});
    } finally {
      console.warn = warn;
      await gone.close();
    }
  });
});
