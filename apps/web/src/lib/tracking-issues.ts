// Parity round 3, lane F5 · PR 847 — the prototype's Ad accounts line "N accounts cannot see every sale" on Marketing › Tracking: a
// platform the owner ticked that is not connected for real (practice copy) or whose last connection test failed or never ran
// cannot be sure to see every sale. Pure, so the count is tested without the page.
export interface PlatformStatus {
  ticked: boolean;
  connected: boolean;
  lastTest: { ok: boolean } | null;
}

/** How many ticked platforms may miss sales. */
export function platformsWithIssues(platforms: readonly PlatformStatus[]): number {
  return platforms.filter((p) => p.ticked && (!p.connected || !p.lastTest || !p.lastTest.ok)).length;
}
