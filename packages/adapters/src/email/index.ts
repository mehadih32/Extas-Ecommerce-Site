// PR 148 — the e-mail sender (Blueprint B2.5: the order e-mail when the customer gave an address). The shop has no
// e-mail provider key yet, so every e-mail goes to the mock: nothing leaves the server, the message waits in a small
// in-memory outbox (the newest 200, this process only) and the sender says it was sent. No message text is ever written
// to a log, a page or the database.
//
// The real provider (SMTP or an e-mail API, with its key in the vault) is its own follow-up: it adds a LIVE adapter
// here, its row in Keys & connections and `allAdapters`. Until then the shop reaches this adapter through
// `createConnections({ adapters: messageAdapters })`, which falls back to the mock when no e-mail connection is on.
import { z } from 'zod';
import { AdapterError, defineAdapter } from '../define';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** What the e-mail is for (`order.placed` …), for the shop's own record; never the text. */
  purpose: string;
  /** PR 290 — the HTML part of an offer e-mail (its plain-text part is `text`). */
  html?: string;
  /** PR 290 — extra headers (the one-click unsubscribe, RFC 8058). */
  headers?: Record<string, string>;
}

export type EmailResult = { ok: true; messageId: string } | { ok: false; error: string };

export interface EmailSender {
  send(message: EmailMessage): Promise<EmailResult>;
}

export interface MockEmail extends EmailMessage {
  messageId: string;
  at: Date;
}

/** The mock outbox's size: older messages fall out. */
const OUTBOX_MAX = 200;

const G = globalThis as unknown as { __extasMockEmail?: MockEmail[] };
const box = (): MockEmail[] => (G.__extasMockEmail ??= []);

/** What the mock "sent" in this process (tests). */
export const mockEmailOutbox = {
  all: (): readonly MockEmail[] => [...box()],
  lastTo: (to: string): MockEmail | undefined => [...box()].reverse().find((m) => m.to === to),
  clear: (): void => {
    box().length = 0;
  },
};

let seq = 0;

export const mockEmailAdapter = defineAdapter<EmailSender, Record<string, never>>({
  kind: 'EMAIL',
  provider: 'mockEmail',
  modes: [],
  secrets: [],
  configSchema: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
  async create() {
    throw new AdapterError('no e-mail provider is connected yet; the mock serves until its key is entered');
  },
  async mock() {
    return {
      async send(m) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.to)) return { ok: false, error: 'not an e-mail address' };
        seq += 1;
        const messageId = `mock-email-${Date.now().toString(36)}-${seq}`;
        const b = box();
        b.push({ ...m, messageId, at: new Date() });
        if (b.length > OUTBOX_MAX) b.splice(0, b.length - OUTBOX_MAX);
        return { ok: true, messageId };
      },
    };
  },
  async test() {
    return { ok: true, message: 'mock e-mail: nothing leaves the server' };
  },
});

export const emailAdapters = [mockEmailAdapter] as const;
