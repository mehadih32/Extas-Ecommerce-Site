// S28 · PR 674 — the editable texts to a courier (`delivery.courier.messages`): one text per event in English and Bengali
// with `{placeholders}` filled from the order, parcel or claim at the moment it is used. Pure: nothing is sent here.
// While the owner's switch is off no text is ever used (the callers get null / no lines).
import type { CourierMessageEvent, CourierMessagesSettings } from '@extas/settings';
import { fillTemplate } from './pure';

/** The values a text may use; a value that is missing leaves no gap (see `fillTemplate`). */
export type MessageVars = Partial<Record<'order' | 'customer' | 'cod' | 'courier' | 'date' | 'amount' | 'consignment', string | null>>;

/** The text for one event in one language, filled; null while the switch is off or when the filled text is empty. */
export function courierMessage(cfg: CourierMessagesSettings, event: CourierMessageEvent, lang: 'en' | 'bn', vars: MessageVars): string | null {
  if (!cfg.enabled) return null;
  const text = fillTemplate(cfg[event][lang], vars);
  return text || null;
}

/**
 * The lines a booking adds to the parcel's note: the booking text, the delivery text, and the COD text only for a parcel
 * with cash to collect (`vars.cod` empty means none). Empty while the switch is off.
 */
export function bookingMessageLines(cfg: CourierMessagesSettings, lang: 'en' | 'bn', vars: MessageVars): string[] {
  const events: CourierMessageEvent[] = vars.cod ? ['booking', 'delivery', 'cod'] : ['booking', 'delivery'];
  return events.map((e) => courierMessage(cfg, e, lang, vars)).filter((x): x is string => x !== null);
}
