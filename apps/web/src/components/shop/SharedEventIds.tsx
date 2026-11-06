// PR 532 follow-up (664) — the order's server event ids (lib/tracking/shared-ids) as one inert data block on the
// thank-you page, for a browser pixel to fire its event under the same id. `type="application/json"`: no code runs;
// `<` is escaped (ldJson) so nothing can end the block early. Nothing is drawn while sharing is off.
import { ldJson } from '@/lib/shop/structured-data';
import { SHARED_IDS_ELEMENT, type SharedIds } from '@/lib/tracking/shared-ids';

export function SharedEventIds({ ids }: { ids: SharedIds | null }) {
  if (!ids) return null;
  return <script type="application/json" id={SHARED_IDS_ELEMENT} data-testid="shared-event-ids" dangerouslySetInnerHTML={{ __html: ldJson(ids as unknown as Record<string, unknown>) }} />;
}
