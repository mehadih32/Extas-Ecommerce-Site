// @extas/messages — the Messages control centre's engine (S05; BACKEND-ARCHITECTURE §5.7 MSG-01/MSG-05, §6.5.6, §8.8).
//
// PR 148: the order journey's messages by SMS, WhatsApp and e-mail. The worker runs `runMessages` per store on a
// schedule: the order timeline becomes queued messages (one per step and channel, never twice), due ones are checked
// and sent through each channel's sender (the mock until the owner types a key in), and the self-confirm's no-reply
// timer fills the call queue. Every step, channel, time, cap and word is a setting or a template; nothing here moves
// money or changes an order.
//
// PR 149: every try is logged (NotificationAttempt, append-only), a failed send is tried again on the `messages.retry`
// waits, and the log (log.ts) shows staff every message with its state and tries; a failed one can be retried by hand.
//
// PR 542: a person's advance request from the order ("Request advance", "Send again") is its own message per channel
// ticked, with the advance still to pay and its pay link (`{advanceAmount}`, `{payLink}`); never a journey step or cap.
//
// PR 291: the SMS gateway (masking name, parts, cost) and Messages › Channels & limits (channels.ts). PR 292: the WhatsApp
// Business Platform (whatsapp.ts): approved templates only for a live send, their approval, the receipts and the
// customer's self-confirm replies through the signed webhook.
//
// PR 298: consent and opt-out checked before every send (consent.ts). PR 505: Messages › Templates (templates.ts): every
// template's words with their preview on the sample order in both languages, where each is used, the missing languages,
// a default put back, and the auto-reply to a customer who writes on WhatsApp (off).
//
// `./pure` holds the rules without a database (tests, the admin screen's preview).
import { setting, type MessagesDeps } from './context';
import { planMessages, sendDue, type PlanResult, type SendRunResult } from './engine';
import { selfConfirmTimers, type SelfConfirmTimerResult } from './self-confirm';

export * from './context';
export * from './pure';
export * from './engine';
export * from './self-confirm';
export * from './admin';
export * from './log';
export * from './channels';
export * from './whatsapp';
export * from './consent';
export * from './templates';

export interface RunResult {
  plan: PlanResult;
  send: SendRunResult;
  selfConfirm: SelfConfirmTimerResult;
}

/** One run for one store: plan, send, then the self-confirm timer. Safe to run again at any time. */
export async function runMessages(deps: MessagesDeps, storeId: number): Promise<RunResult | null> {
  if (!(await setting(deps, storeId, 'messages.enabled'))) return null;
  const plan = await planMessages(deps, storeId);
  const send = await sendDue(deps, storeId);
  const selfConfirm = await selfConfirmTimers(deps, storeId);
  return { plan, send, selfConfirm };
}
