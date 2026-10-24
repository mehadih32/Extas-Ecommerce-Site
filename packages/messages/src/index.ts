// @extas/messages — the Messages control centre's engine (S05; BACKEND-ARCHITECTURE §5.7 MSG-01/MSG-05, §6.5.6, §8.8).
//
// PR 148: the order journey's messages by SMS, WhatsApp and e-mail. The worker runs `runMessages` per store on a
// schedule: the order timeline becomes queued messages (one per step and channel, never twice), due ones are checked
// and sent through each channel's sender (the mock until the owner types a key in), and the self-confirm's no-reply
// timer fills the call queue. Every step, channel, time, cap and word is a setting or a template; nothing here moves
// money or changes an order.
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
