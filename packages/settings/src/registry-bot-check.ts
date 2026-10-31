// S18 · PR 379 (Blueprint B6.3) — invisible bot protection on the sign-in and the checkout, never a CAPTCHA (registry
// version 74). Labels: messages/bot-check.<lang>.json (group `security`, Settings → Team & roles → Sign-in & security).
//
// The customer never sees anything: no "I am human" box, no Turnstile, no challenge page. The page sends a few
// behaviour signals with the sign-in and the order (how long the form was open, whether a key, a tap or the mouse was
// used, whether the browser says it is driven by automation); the server scores them and, in `observe` (the default),
// writes a security event for staff when the score reaches `security.bot.noteScore`. Nothing is ever refused or blocked
// because of the score (the owner's rule: nothing blocks automatically). The decisive layers are the request limits
// (PR 378), Cloudflare's rules (PR 386) and the order risk engine.
//
// - `security.bot.mode`: `observe` (score and note) or `off` (no score).
// - `security.bot.minFillSeconds`: a form sent faster than this, per form, is a signal (people need a few seconds).
// - `security.bot.weights`: how much each signal adds to the score (0 = ignore it); the score is capped at 100.
// - `security.bot.noteScore`: from this score on, a security event is written.
import { z } from 'zod';
import { setting } from './define';

const V = 74;

const base = { scope: 'installation', isOwnerData: false, isPublic: false, group: 'security', version: V } as const;

export const BOT_MODES = ['off', 'observe'] as const;
export type BotMode = (typeof BOT_MODES)[number];

/** The forms that send the signals. */
export const BOT_FORMS = ['checkout', 'signIn', 'adminSignIn'] as const;
export type BotForm = (typeof BOT_FORMS)[number];

const seconds = z.int().min(0).max(120);
export const botMinFillSchema = z.object({ checkout: seconds, signIn: seconds, adminSignIn: seconds }).strict();

const weight = z.int().min(0).max(100);
/** `missing`: no signals at all (a script, not a page). `automation`: the browser says it is automated. */
export const botWeightsSchema = z.object({ missing: weight, automation: weight, tooFast: weight, noInput: weight }).strict();
export type BotWeights = z.output<typeof botWeightsSchema>;

export const botCheckSettings = {
  'security.bot.mode': setting({
    ...base,
    schema: z.enum(BOT_MODES),
    default: 'observe' as BotMode,
    valueType: 'ENUM',
    labelKey: 'security.bot.mode.label',
    helpKey: 'security.bot.mode.help',
    sortOrder: 300,
  }),
  'security.bot.minFillSeconds': setting({
    ...base,
    schema: botMinFillSchema,
    default: { checkout: 5, signIn: 2, adminSignIn: 2 },
    valueType: 'JSON',
    labelKey: 'security.bot.minFillSeconds.label',
    helpKey: 'security.bot.minFillSeconds.help',
    sortOrder: 310,
  }),
  'security.bot.weights': setting({
    ...base,
    schema: botWeightsSchema,
    default: { missing: 50, automation: 60, tooFast: 40, noInput: 30 } as BotWeights,
    valueType: 'JSON',
    labelKey: 'security.bot.weights.label',
    helpKey: 'security.bot.weights.help',
    sortOrder: 320,
  }),
  'security.bot.noteScore': setting({
    ...base,
    schema: z.int().min(1).max(100),
    default: 60,
    valueType: 'INT',
    labelKey: 'security.bot.noteScore.label',
    helpKey: 'security.bot.noteScore.help',
    sortOrder: 330,
  }),
};
