// PR 288 — the kinds of touch the journey view shows (no database; the settings, the page and the service share it),
// in the order a tie at the same moment is listed.
export const JOURNEY_KINDS = ['profile', 'visit', 'touch', 'order', 'exchange', 'message', 'chat', 'review', 'wallet', 'consent', 'merge', 'note'] as const;
export type JourneyKind = (typeof JOURNEY_KINDS)[number];
