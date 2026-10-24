// PR 148 — the WhatsApp sender (Blueprint A1.3, B2.5; CN-019). The shop has no WhatsApp Business key yet, so every
// WhatsApp goes to the mock: nothing leaves the server, the message waits in a small in-memory outbox (the newest 200,
// this process only) and the sender says it was sent. The admin's Messages log then shows "would send". No message
// text is ever written to a log, a page or the database (the shop's record, NotificationLog, holds who and why).
//
// The real provider (WhatsApp Business through a BSP, with its key in the vault) is its own follow-up: it adds a LIVE
// adapter here, its row in Keys & connections and `allAdapters`. Until then the shop reaches this adapter through
// `createConnections({ adapters: messageAdapters })`, which falls back to the mock when no WhatsApp connection is on.
import { z } from 'zod';
import { AdapterError, defineAdapter } from '../define';

export interface WhatsAppMessage {
  /** The number in +country form (+8801…). */
  to: string;
  text: string;
  /** What the message is for (`order.placed` …), for the shop's own record; never the text. */
  purpose: string;
}

export type WhatsAppResult = { ok: true; messageId: string } | { ok: false; error: string; /** the number has no WhatsApp */ notOnWhatsApp?: boolean };

export interface WhatsAppSender {
  send(message: WhatsAppMessage): Promise<WhatsAppResult>;
}

export interface MockWhatsApp extends WhatsAppMessage {
  messageId: string;
  at: Date;
}

/** The mock outbox's size: older messages fall out. */
const OUTBOX_MAX = 200;

const G = globalThis as unknown as { __extasMockWhatsApp?: MockWhatsApp[] };
const box = (): MockWhatsApp[] => (G.__extasMockWhatsApp ??= []);

/** What the mock "sent" in this process (tests). */
export const mockWhatsAppOutbox = {
  all: (): readonly MockWhatsApp[] => [...box()],
  lastTo: (to: string): MockWhatsApp | undefined => [...box()].reverse().find((m) => m.to === to),
  clear: (): void => {
    box().length = 0;
  },
};

let seq = 0;

export const mockWhatsAppAdapter = defineAdapter<WhatsAppSender, Record<string, never>>({
  kind: 'WHATSAPP',
  provider: 'mockWhatsApp',
  modes: [],
  secrets: [],
  configSchema: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
  async create() {
    throw new AdapterError('no WhatsApp provider is connected yet; the mock serves until its key is entered');
  },
  async mock() {
    return {
      async send(m) {
        if (!/^\+[1-9]\d{7,14}$/.test(m.to)) return { ok: false, error: 'not a phone number in +country form' };
        seq += 1;
        const messageId = `mock-wa-${Date.now().toString(36)}-${seq}`;
        const b = box();
        b.push({ ...m, messageId, at: new Date() });
        if (b.length > OUTBOX_MAX) b.splice(0, b.length - OUTBOX_MAX);
        return { ok: true, messageId };
      },
    };
  },
  async test() {
    return { ok: true, message: 'mock WhatsApp: nothing leaves the server' };
  },
});

export const whatsappAdapters = [mockWhatsAppAdapter] as const;
