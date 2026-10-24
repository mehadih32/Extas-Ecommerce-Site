// S06 · PR 542 — the words and the small rules of the "Advance request" card on Orders › Risk rules (under the Levels
// card): the auto switch (off as it ships), the ways ticked first, the payment service of the pay link. Worked out on the
// server and handed to the client card; the API checks the value again.
import type { AdvanceSettingsView } from '@extas/orders';
import type { AdvanceChannel, AdvanceProvider, AdvanceRequestSettings } from '@extas/settings';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';

export interface AdvanceCardTexts {
  h: string;
  d: string;
  auto: string;
  autoHelp: string;
  autoOff: string;
  autoNoLevels: string;
  channels: string;
  ch: Record<AdvanceChannel, string>;
  provider: string;
  providerHelp: string;
  prov: Record<string, string>;
  words: string;
  noChannel: string;
  save: string;
  saving: string;
  saved: string;
  unsaved: string;
  discard: string;
  readOnly: string;
  err: Record<string, string>;
}

/** The ways, in the order the card shows them (kept here so the client card does not load the settings registry). */
export const ADVANCE_CHANNELS: readonly AdvanceChannel[] = ['SMS', 'WHATSAPP', 'CALL'];

const ERRORS = ['STALE', 'INVALID_INPUT', 'FORBIDDEN', 'UNAUTHENTICATED', 'network', 'other'] as const;

export function advanceCardTexts(view: AdminView, providers: readonly AdvanceProvider[]): AdvanceCardTexts {
  const d = view.dict;
  const k = (x: string) => t(d, `orders.rr.adv.${x}`);
  const r = (x: string) => t(d, `orders.rr.${x}`);
  return {
    h: k('h'),
    d: k('d'),
    auto: k('auto'),
    autoHelp: k('autoHelp'),
    autoOff: k('autoOff'),
    autoNoLevels: k('autoNoLevels'),
    channels: k('channels'),
    ch: Object.fromEntries(ADVANCE_CHANNELS.map((c) => [c, k(`ch.${c}`)])) as Record<AdvanceChannel, string>,
    provider: k('provider'),
    providerHelp: k('providerHelp'),
    prov: Object.fromEntries(providers.map((p) => [p, k(`prov.${p}`)])),
    words: k('words'),
    noChannel: k('noChannel'),
    save: r('save'),
    saving: r('saving'),
    saved: r('saved'),
    unsaved: r('unsaved'),
    discard: r('discard'),
    readOnly: r('readOnly'),
    err: Object.fromEntries(ERRORS.map((e) => [e, r(`err.${e}`)])),
  };
}

/** What the client card needs from the view (the value, the services, whether levels are on, the version). */
export type AdvanceCardScreen = Pick<AdvanceSettingsView, 'value' | 'providers' | 'levelsOn' | 'version'>;

export const advanceCardScreen = (v: AdvanceSettingsView): AdvanceCardScreen => ({ value: v.value, providers: v.providers, levelsOn: v.levelsOn, version: v.version });

/** Why the draft cannot be saved yet: auto on with no way ticked would send nothing. */
export const advanceDraftProblem = (v: AdvanceRequestSettings): 'noChannel' | null => (v.auto && !ADVANCE_CHANNELS.some((c) => v.channels[c]) ? 'noChannel' : null);

export const sameAdvance = (a: AdvanceRequestSettings, b: AdvanceRequestSettings): boolean => JSON.stringify(a) === JSON.stringify(b);
