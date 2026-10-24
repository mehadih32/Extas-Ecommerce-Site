// PR 130, 291 — what every SMS sender offers (the mock and each gateway), and the mock itself: nothing leaves the server,
// the message waits in a small in-memory outbox (the newest 200, this process only). A gateway connection that has not
// passed its test yet runs on the same mock.

export interface SmsMessage {
  /** The number in +country form (+8801…). */
  to: string;
  text: string;
  /** What the SMS is for (`account.code`), for the shop's own record; never the text. */
  purpose: string;
  /**
   * PR 291 — the sender the customer sees: the shop's approved masking name, or null/absent for the gateway's own
   * number (the connection's `senderId`).
   */
  senderId?: string | null;
}

export type SmsResult =
  | { ok: true; messageId: string; /** PR 291: the gateway's own price for it, when it says (minor units) */ costMinor?: number | null }
  | { ok: false; error: string; /** PR 291: this number cannot get an SMS at all (never tried again) */ unreachable?: boolean };

/** PR 291 — what is left on the gateway account, when it says: an amount (minor units) or a count of SMS. */
export interface SmsBalance {
  amountMinor: number | null;
  sms: number | null;
}

export interface SmsSender {
  send(message: SmsMessage): Promise<SmsResult>;
  /** PR 291 — the credit left on the account (null when the gateway does not say; the mock has none). */
  balance?(): Promise<SmsBalance | null>;
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

/** The mock sender (the mock adapter, and a gateway connection while it is in MOCK). */
export function mockSmsSender(): SmsSender {
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
    async balance() {
      return null;
    },
  };
}
