// S29 · PR 761 — the advisor's promises, with no database: global AI off means no read, no AI call and no draft; an AI "no"
// leaves a suggestion out; and the only thing the advisor ever writes is a draft (`aiApprovalRequest.create`), never anything else.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LensResult, LensRowOut } from '@extas/metrics';

const risk = vi.hoisted(() => ({ result: null as unknown }));
vi.mock('@extas/metrics', async (orig) => ({
  ...((await orig()) as object),
  geoRisk: vi.fn(async () => risk.result),
  geoMoney: vi.fn(async () => ({
    rows: [],
    unknown: {},
    outside: {},
    total: {},
    extras: {},
    hidden: [],
  })),
  geoDemand: vi.fn(async () => ({
    rows: [],
    unknown: {},
    outside: {},
    total: {},
    extras: {},
    hidden: [],
  })),
  courierLens: vi.fn(async () => ({
    rows: [],
    details: {},
    couriers: [],
    places: {},
    gaps: [],
    unknownOrders: 0,
  })),
}));
vi.mock('./lens-api', () => ({
  riskParts: async () => new Set(['returns', 'refusals']),
  moneyParts: async () => new Set(),
  topRiskBand: async () => null,
}));
vi.mock('../order-profit-view', () => ({ profitInputs: async () => ({}) }));

import { ADVICE_KIND, advisorStatus, districtsOf, runGeoAdvisor } from './advisor';

const row = (areaId: string, nameEn: string, figures: Record<string, number | null>, flags: string[] = []): LensRowOut => ({
  areaId,
  nameEn,
  nameBn: null,
  parentAreaId: null,
  parentNameEn: null,
  parentNameBn: null,
  figures,
  flags,
});
const lensOf = (rows: LensRowOut[]) =>
  ({
    level: 'district',
    days: { from: '2026-11-01', to: '2026-11-15' },
    rows,
    unknown: {},
    outside: {},
    total: {},
    extras: {},
    hidden: [],
  }) as unknown as LensResult;

const ON = {
  minOrders: 10,
  warnReturnPct: 25,
  topProducts: 5,
};

function world(
  over: {
    geoMap?: unknown;
    aiEnabled?: boolean;
    advisor?: { maxPerRun: number; expiresDays: number };
  } = {},
) {
  const writes: { model: string; op: string; data?: unknown }[] = [];
  const touch = (model: string) =>
    new Proxy(
      {},
      {
        get: (_t, op: string) => async (a?: { data?: unknown }) => (
          writes.push({ model, op, data: a?.data }),
          op === 'create' ? { id: `ap-${writes.length}` } : null
        ),
      },
    );
  const db = new Proxy({}, { get: (_t, model: string) => touch(model) });
  const values: Record<string, unknown> = {
    'reports.geoMap': 'geoMap' in over ? over.geoMap : ON,
    'ai.enabled': over.aiEnabled ?? true,
    'reports.geoAdvisor': over.advisor ?? { maxPerRun: 10, expiresDays: 14 },
    'store.timeZone': 'Asia/Dhaka',
    'store.currency': 'BDT',
    'ads.geoGuide': { minOrders: 10, goodReturnPct: 15, badReturnPct: 30 },
  };
  const resolver = { value: async (k: string) => values[k] };
  return { db: db as never, resolver: resolver as never, vault: null, writes };
}

const actor = { staffUserId: 'u1' } as never;
const days = { from: '2026-11-01', to: '2026-11-15' };

beforeEach(() => {
  risk.result = lensOf([
    row(
      'd1',
      'Bogura',
      {
        delivered: 12,
        returned: 8,
        settled: 20,
        returnRate: 0.4,
        refusedAtDoor: 5,
      },
      ['returnHotspot'],
    ),
    row(
      'd2',
      'Dhaka',
      {
        delivered: 90,
        returned: 10,
        settled: 100,
        returnRate: 0.1,
        refusedAtDoor: 0,
      },
      [],
    ),
  ]);
});

describe("the gates", () => {
  it("reports where it stands: global AI off, or ready (no geo-specific switch)", async () => {
    expect(await advisorStatus(world({ geoMap: undefined }).resolver, 1)).toBe(
      "ready",
    );
    expect(await advisorStatus(world({ aiEnabled: false }).resolver, 1)).toBe(
      "aiOff",
    );
    expect(await advisorStatus(world().resolver, 1)).toBe("ready");
  });

  it.each([["AI is off", { aiEnabled: false }, "aiOff"]] as const)(
    "%s: no AI call, no draft, nothing written",
    async (_n, over, status) => {
      const w = world(over);
      const explain = vi.fn(async () => "note");
      const run = await runGeoAdvisor({ ...w, explain }, 1, {
        actor,
        lang: "en",
        days,
      });
      expect(run).toMatchObject({ status, found: 0, drafted: 0 });
      expect(explain).not.toHaveBeenCalled();
      expect(w.writes).toEqual([]);
    },
  );
});

describe('a run', () => {
  it('drafts one card per suggestion that has an AI note, and writes nothing but the drafts', async () => {
    const w = world();
    const explain = vi.fn(async () => 'Because of the returns.');
    const run = await runGeoAdvisor({ ...w, explain, now: () => new Date('2026-11-16T00:00:00Z') }, 1, { actor, lang: 'en', days });
    expect(run.status).toBe('ready');
    expect(run.drafted).toBe(run.found);
    expect(run.found).toBeGreaterThanOrEqual(2); // a COD advance for Bogura, and the ad lists
    expect(w.writes.length).toBe(run.drafted + w.writes.filter((x) => x.op === 'findFirst').length);
    const creates = w.writes.filter((x) => x.op === 'create');
    expect(creates.every((c) => c.model === 'aiApprovalRequest')).toBe(true);
    expect(w.writes.every((x) => x.model === 'aiApprovalRequest')).toBe(true);
    const first = creates[0]!.data as Record<string, unknown>;
    expect(first).toMatchObject({
      kind: ADVICE_KIND,
      agentKey: 'gyani',
      channel: 'geo-map',
      refType: 'geo-advice',
      summary: 'Because of the returns.',
    });
    expect((first.payload as Record<string, unknown>).advisoryOnly).toBe(true);
    expect((first.expiresAt as Date).toISOString()).toBe('2026-11-30T00:00:00.000Z');
  });

  it('keeps only maxPerRun drafts and says how many it left', async () => {
    const w = world({ advisor: { maxPerRun: 1, expiresDays: 3 } });
    const run = await runGeoAdvisor({ ...w, explain: async () => 'n' }, 1, {
      actor,
      lang: 'bn',
      days,
    });
    expect(run.drafted).toBe(1);
    expect(run.left.overCap).toBe(run.found - 1);
  });

  it('an AI "no" (off, paused, capped, mock) leaves the suggestion out: no note, no draft', async () => {
    const w = world();
    const run = await runGeoAdvisor({ ...w, explain: async () => null }, 1, {
      actor,
      lang: 'en',
      days,
    });
    expect(run.drafted).toBe(0);
    expect(run.left.noNote).toBe(run.found);
    expect(w.writes.filter((x) => x.op === 'create')).toEqual([]);
  });

  it("reads every lens (no per-lens switch) and still drafts nothing without an AI note", async () => {
    const w = world();
    await expect(
      runGeoAdvisor({ ...w, explain: async () => null }, 1, {
        actor,
        lang: 'en',
        days,
      }),
    ).resolves.toMatchObject({ status: 'ready' });
  });
});

describe('districtsOf', () => {
  it('takes delivered and returned from the risk rows, and nothing when the returns part is hidden', () => {
    expect(districtsOf(lensOf([row('d1', 'Bogura', { delivered: 3, returned: 1 })]))).toEqual([
      {
        areaId: 'd1',
        nameEn: 'Bogura',
        nameBn: null,
        delivered: 3,
        returned: 1,
      },
    ]);
    expect(districtsOf(lensOf([row('d1', 'Bogura', { delivered: null, returned: null })]))).toBeNull();
    expect(districtsOf(null)).toBeNull();
  });
});
