// S14 · PR 505 — the Order journey form's fields as typed and back to the settings: each step's switch, channel,
// fallback, e-mail, time (at once, minutes later, or a time of day some days after), orders and template; under "More
// options" the message language, the amount line and the self-confirm. Numbers are typed as text and checked here
// before the API checks every value again; only what differs from the screen is sent. No React, so it is tested alone.
import type { Journey, JourneyConfig, JourneyStep } from '@extas/messages';

export const STEP_CHANNELS = ['SMS', 'WHATSAPP', 'EMAIL'] as const;
export const FALLBACKS = ['NONE', 'SMS', 'WHATSAPP', 'EMAIL'] as const;
export const WHEN_KINDS = ['now', 'after', 'at'] as const;
export const AUDIENCES = ['all', 'cod', 'prepaid'] as const;
export const LANGUAGES = ['store', 'bn', 'en'] as const;

/** The timeline's steps (in order), then the event messages outside it. */
export const TIMELINE_STEPS = ['placed', 'selfConfirm', 'confirmed', 'packed', 'booked', 'outForDelivery', 'deliveryDay', 'delivered', 'day1Care', 'day3Review'] as const satisfies readonly JourneyStep[];

export interface StepDraft {
  on: boolean;
  channel: (typeof STEP_CHANNELS)[number];
  fallback: (typeof FALLBACKS)[number];
  email: boolean;
  kind: (typeof WHEN_KINDS)[number];
  minutes: string;
  days: string;
  hour: string;
  minute: string;
  who: (typeof AUDIENCES)[number];
  template: string;
}

export interface JourneyDraft {
  steps: Record<string, StepDraft>;
  language: (typeof LANGUAGES)[number];
  amountLine: { en: string; bn: string };
  newOnly: boolean;
  waitHours: string;
  confirmOnYes: boolean;
  countsAsOne: boolean;
}

type StepConfig = Journey[JourneyStep];

function stepDraft(s: StepConfig): StepDraft {
  const w = s.when;
  return {
    on: s.on,
    channel: s.channel,
    fallback: s.fallback,
    email: s.email,
    kind: w.kind,
    minutes: w.kind === 'after' ? String(w.minutes) : '',
    days: w.kind === 'at' ? String(w.days) : '',
    hour: w.kind === 'at' ? String(w.hour) : '',
    minute: w.kind === 'at' ? String(w.minute) : '',
    who: s.who,
    template: s.template,
  };
}

export function journeyDraft(c: JourneyConfig): JourneyDraft {
  return {
    steps: Object.fromEntries(Object.entries(c.journey).map(([k, s]) => [k, stepDraft(s)])),
    language: c.language,
    amountLine: { en: c.amountLine.en, bn: c.amountLine.bn },
    newOnly: c.selfConfirm.newCustomersOnly,
    waitHours: String(c.selfConfirm.waitHours),
    confirmOnYes: c.selfConfirm.confirmOnYes,
    countsAsOne: c.selfConfirm.countsAsTheOneWhatsApp,
  };
}

const int = (s: string): number | null => (/^\s*\d+\s*$/.test(s) ? Number(s) : null);

/** A step as the setting keeps it, or null when a number is not a whole number. */
export function stepOf(d: StepDraft): StepConfig | null {
  let when: StepConfig['when'];
  if (d.kind === 'now') when = { kind: 'now' };
  else if (d.kind === 'after') {
    const minutes = int(d.minutes);
    if (minutes === null) return null;
    when = { kind: 'after', minutes };
  } else {
    const [days, hour, minute] = [int(d.days), int(d.hour), int(d.minute)];
    if (days === null || hour === null || minute === null) return null;
    when = { kind: 'at', days, hour, minute };
  }
  return { on: d.on, channel: d.channel, fallback: d.fallback, email: d.email, when, who: d.who, template: d.template.trim() };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The changed settings of a draft, by the screen's field names; `bad` names steps whose numbers are not whole. */
export function journeyChanges(d: JourneyDraft, c: JourneyConfig): { changes: Record<string, unknown>; bad: string[] } {
  const out: Record<string, unknown> = {};
  const bad: string[] = [];
  const journey = { ...c.journey } as Record<string, StepConfig>;
  for (const [k, s] of Object.entries(d.steps)) {
    const next = stepOf(s);
    if (!next) bad.push(k);
    else journey[k] = next;
  }
  if (!same(journey, c.journey)) out.journey = journey;
  if (d.language !== c.language) out.language = d.language;
  if (!same(d.amountLine, { en: c.amountLine.en, bn: c.amountLine.bn })) out.amountLine = d.amountLine;
  const wait = int(d.waitHours);
  if (wait === null) bad.push('waitHours');
  const selfConfirm = { newCustomersOnly: d.newOnly, waitHours: wait ?? c.selfConfirm.waitHours, confirmOnYes: d.confirmOnYes, countsAsTheOneWhatsApp: d.countsAsOne };
  if (!same(selfConfirm, c.selfConfirm)) out.selfConfirm = selfConfirm;
  return { changes: out, bad };
}

/** "11:00" from an hour and a minute (Western digits, two places). */
export const clock = (hour: number, minute: number): string => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
