// S14 · PR 291, 292, 298, 505 — the Messages pages' words: the same keys in Bengali and English, Western digits in the
// Bengali, and a label for every state, channel, journey step and skip reason the engine can write, so a page never
// shows a raw code.
import { describe, expect, it } from 'vitest';
import { WHATSAPP_TEMPLATE_STATES } from '@extas/adapters';
import { WA_BODY_PROBLEMS } from '@extas/messages/pure';
import { JOURNEY_STEPS, MESSAGE_CHANNELS } from '@extas/settings';
import bn from '../../../messages/admin-messages.bn.json';
import en from '../../../messages/admin-messages.en.json';
import { t, type Dict } from '../i18n';
import { label, msgError } from './i18n';

const keys = (d: Dict, at = ''): string[] => Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [`${at}${k}`] : keys(v, `${at}${k}.`)));
const strings = (d: Dict): string[] => Object.values(d).flatMap((v) => (typeof v === 'string' ? [v] : strings(v)));

/** Every reason the engine and the log write (packages/messages engine.ts, pure.ts render). */
const REASONS = ['MASTER_OFF', 'UNKNOWN_STEP', 'STEP_OFF', 'QUIET_HOURS', 'NO_ORDER', 'ORDER_MOVED_ON', 'REASON_SILENT', 'NO_RECIPIENT', 'CAP_SMS', 'CAP_WHATSAPP', 'CAP_EMAIL', 'CAP_TOTAL', 'NO_TEMPLATE', 'AMOUNT_RULE', 'NO_LINK', 'NO_KEPT_ORDER', 'UNKNOWN_TOKEN', 'RETRY', 'STAFF_RETRY', 'UNREACHABLE', 'NO_SENDER', 'SEND_FAILED', 'PROVIDER_FAILED', 'WA_TEMPLATE_NOT_APPROVED'];

describe('the Messages pages` words', () => {
  it('Bengali and English have the same keys; the Bengali writes Western digits', () => {
    expect(keys(bn as Dict).sort()).toEqual(keys(en as Dict).sort());
    expect(strings(bn as Dict).filter((s) => /[০-৯]/.test(s))).toEqual([]);
  });

  it('every state, channel, step and reason has its words; an unknown code shows itself, a refusal the general words', () => {
    for (const d of [bn, en] as Dict[]) {
      const has = (k: string) => expect(t(d, k), k).not.toBe(k);
      for (const s of ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED', 'BLOCKED_BY_GUARD']) has(`msg.status.${s}`);
      for (const c of MESSAGE_CHANNELS) has(`msg.channel.${c}`);
      for (const s of [...JOURNEY_STEPS, 'selfConfirmAnswer', 'advanceRequest']) has(`msg.step.${s}`);
      for (const r of REASONS) has(`msg.reason.${r}`);
      for (const m of ['MOCK', 'SANDBOX', 'LIVE', 'none']) has(`msg.mode.${m}`);
      for (const e of ['STALE', 'INVALID_INPUT', 'FORBIDDEN', 'NOT_FOUND', 'NOT_RETRYABLE', 'PROVIDER_ERROR', 'network', 'other']) has(`msg.err.${e}`);
      // PR 292: every state Meta gives a template, and every reason it would refuse one
      for (const s of [...WHATSAPP_TEMPLATE_STATES, 'none']) has(`msg.wa.state.${s}`);
      for (const p of WA_BODY_PROBLEMS) has(`msg.wa.problem.${p}`);
      expect(label(d, 'reason', 'SOMETHING_NEW')).toBe('SOMETHING_NEW');
      expect(label(d, 'reason', null)).toBe('');
      expect(msgError(d, 'SOMETHING_NEW')).toBe(t(d, 'msg.err.other'));
    }
  });
});
