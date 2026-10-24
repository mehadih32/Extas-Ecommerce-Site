// PR 130 — the SMS sender (Blueprint A1.3). Until the owner types a gateway's key in, every SMS goes to the mock: nothing
// leaves the server, the message waits in a small in-memory outbox (the newest 200, this process only) and the sender
// says it was sent. The tests read the outbox; a CI-only test route reads the newest code for one number
// (EXTAS_SHOP_TEST_PAGES=1). No message text is ever written to a log, a page or the database: the shop's own record
// of an SMS (NotificationLog) holds who it went to and why, never the words.
//
// S14 · PR 291 — the real gateway: BulkSMSBD (bulk-sms-bd.ts), a Bangladeshi SMS gateway with masking, its key in the
// vault and its row in Keys & connections. An SMS goes from the shop's masking name (the brand name the gateway had
// approved, `messages.sms.masking`) once the owner marked it approved, else from the gateway's own number. The mock
// stays first in `smsAdapters`, so with no SMS connection switched on the shop falls back to it.
import { z } from 'zod';
import { AdapterError, defineAdapter } from '../define';
import { bulkSmsBdAdapter } from './bulk-sms-bd';
import { mockSmsSender, type SmsSender } from './contract';

export * from './contract';
export * from './bulk-sms-bd';

export const mockSmsAdapter = defineAdapter<SmsSender, Record<string, never>>({
  kind: 'SMS',
  provider: 'mockSms',
  modes: [],
  secrets: [],
  configSchema: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
  async create() {
    throw new AdapterError('no SMS gateway is connected yet; the mock serves until its key is entered');
  },
  async mock() {
    return mockSmsSender();
  },
  async test() {
    return { ok: true, message: 'mock SMS: nothing leaves the server' };
  },
});

/** The mock first (the fallback when no SMS connection is switched on), then the real gateways. */
export const smsAdapters = [mockSmsAdapter, bulkSmsBdAdapter] as const;

/** PR 291 — the SMS gateways with a key (rows of Keys & connections). */
export const liveSmsAdapters = [bulkSmsBdAdapter] as const;
