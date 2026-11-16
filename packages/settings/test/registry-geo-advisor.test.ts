// S29 · PR 761 — the Geography map advisor's setting: two numbers, both with bounds, shipped at a safe default; the advisor's own
// on/off is `reports.geoMap.ai` (off as shipped, lane G1), so this setting alone never turns anything on.
import { describe, expect, it } from 'vitest';
import { registry } from '../src/registry';
import { GEO_ADVISOR_DEFAULT, geoAdvisorSchema } from '../src/registry-geo-advisor';

describe('PR 761 · reports.geoAdvisor', () => {
  it('is in the registry, store scope, at its shipped default', () => {
    expect(registry['reports.geoAdvisor'].scope).toBe('store');
    expect(registry['reports.geoAdvisor'].default).toEqual(GEO_ADVISOR_DEFAULT);
    expect(registry['reports.geoAdvisor'].isOwnerData).toBe(false);
    expect(registry['reports.geoAdvisor'].version).toBe(761);
  });
  it('keeps both numbers whole and inside their bounds', () => {
    expect(geoAdvisorSchema.safeParse({ maxPerRun: 1, expiresDays: 1 }).success).toBe(true);
    expect(geoAdvisorSchema.safeParse({ maxPerRun: 50, expiresDays: 90 }).success).toBe(true);
    expect(geoAdvisorSchema.safeParse({ maxPerRun: 0, expiresDays: 14 }).success).toBe(false);
    expect(geoAdvisorSchema.safeParse({ maxPerRun: 51, expiresDays: 14 }).success).toBe(false);
    expect(geoAdvisorSchema.safeParse({ maxPerRun: 10, expiresDays: 0 }).success).toBe(false);
    expect(geoAdvisorSchema.safeParse({ maxPerRun: 10, expiresDays: 91 }).success).toBe(false);
    expect(geoAdvisorSchema.safeParse({ maxPerRun: 2.5, expiresDays: 14 }).success).toBe(false);
  });
  it('takes no other field (an unknown one is refused, never kept)', () => {
    expect(geoAdvisorSchema.safeParse({ ...GEO_ADVISOR_DEFAULT, on: true }).success).toBe(false);
  });
});
