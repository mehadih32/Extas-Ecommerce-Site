// PR 130 — the SMS sender (Blueprint A1.3). The shop has no SMS gateway key yet, so every SMS goes to the mock: nothing
// leaves the server, the message waits in a small in-memory outbox (the newest 200, this process only) and the sender
// says it was sent. The tests read the outbox; a CI-only test route reads the newest code for one number
// (EXTAS_SHOP_TEST_PAGES=1). No message text is ever written to a log, a page or the database: the shop's own record
// of an SMS (NotificationLog) holds who it went to and why, never the words.
//
// The real gateway (a Bangladeshi SMS provider, with its key in the vault) is its own follow-up: it adds a LIVE
// adapter here, its row in Keys & connections and `allAdapters`. Until then this adapter is not listed there (a row
// would offer the owner a key field for a gateway that does not exist yet); the shop reaches it through
// `createConnections({ adapters: smsAdapters })`, which falls back to the mock when no SMS connection is switched on.
import { z } from 'zod';
import { AdapterError, defineAdapter } from '../define';

export interface SmsMessage {
  /** The number in +country form (+8801…). */
  to: string;
  text: string;
  /** What the SMS is for (`account.code`), for the shop's own record; never the text. */
  purpose: string;
}

export type SmsResult = { ok: true; messageId: string } | { ok: false; error: string };

export interface SmsSender {
  send(message: SmsMessage): Promise<SmsResult>;
}

export interface MockSms extends SmsMessage {
  messageId: string;
  at: Date;
}

/** The mock outbox's size: older messages fall out. */
const OUTBOX_MAX = 200;

const G = globalThis as unknown as { __extasMockSms?: MockSms[] };
const box = (): MockSms[] => (G.__extasMockSms ??= []);

/** What the mock "sent" in this process (tests and the CI-only test route). */
export const mockSmsOutbox = {
  all: (): readonly MockSms[] => [...box()],
  /** The newest message to a number. */
  lastTo: (to: string): MockSms | undefined => [...box()].reverse().find((m) => m.to === to),
  clear: (): void => {
    box().length = 0;
  },
};

let seq = 0;

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
    return {
      async send(m) {
        if (!/^\+[1-9]\d{7,14}$/.test(m.to)) return { ok: false, error: 'not a phone number in +country form' };
        seq += 1;
        const messageId = `mock-sms-${Date.now().toString(36)}-${seq}`;
        const b = box();
        b.push({ ...m, messageId, at: new Date() });
        if (b.length > OUTBOX_MAX) b.splice(0, b.length - OUTBOX_MAX);
        return { ok: true, messageId };
      },
    };
  },
  async test() {
    return { ok: true, message: 'mock SMS: nothing leaves the server' };
  },
});

export const smsAdapters = [mockSmsAdapter] as const;
