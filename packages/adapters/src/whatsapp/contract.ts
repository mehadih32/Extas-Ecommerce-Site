// PR 148, 292 — what every WhatsApp sender offers (the mock and the WhatsApp Business provider), and the mock itself:
// nothing leaves the server, the message waits in a small in-memory outbox (the newest 200, this process only) and the
// sender says it was sent. The admin's Messages log then shows "would send". No message text is ever written to a log,
// a page or the database (the shop's record, NotificationLog, holds who and why).
//
// PR 292: a message the shop starts (not an answer within the customer's 24 hours) goes as a template the provider
// approved: its name, language and the values of its {{1}}, {{2}} … in order. The provider's word on each template
// (pending, approved, rejected, paused) is read back, and a template is sent for approval from the admin. The mock
// plays the provider: a template sent for approval is pending, and approved on the next read.

export interface WhatsAppTemplateRef {
  /** The approved template's name with the provider (`order_placed`). */
  name: string;
  /** The provider's language code (`en`, `bn`). */
  language: string;
  /** The values of {{1}}, {{2}} … in order. */
  params: string[];
}

export interface WhatsAppMessage {
  /** The number in +country form (+8801…). */
  to: string;
  text: string;
  /** What the message is for (`order.placed` …), for the shop's own record; never the text. */
  purpose: string;
  /** PR 292 — send as this approved template (the provider needs one outside the customer's 24 hours). */
  template?: WhatsAppTemplateRef | null;
}

export type WhatsAppResult =
  | { ok: true; messageId: string; /** the provider's own price, when it says (minor units) */ costMinor?: number | null }
  | { ok: false; error: string; /** the number has no WhatsApp */ notOnWhatsApp?: boolean };

/** The provider's word on one template. */
export const WHATSAPP_TEMPLATE_STATES = ['PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED'] as const;
export type WhatsAppTemplateState = (typeof WHATSAPP_TEMPLATE_STATES)[number];

export interface WhatsAppTemplateStatus {
  name: string;
  language: string;
  status: WhatsAppTemplateState;
  /** The provider's reason for a refusal (a short line), when it gives one. */
  reason: string | null;
}

export interface WhatsAppTemplateDraft {
  name: string;
  language: string;
  /** UTILITY for order updates (the provider's category). */
  category: string;
  /** The body with {{1}}, {{2}} … */
  body: string;
  /** One sample value per {{n}}, as the provider asks for. */
  examples: string[];
}

export interface WhatsAppSender {
  send(message: WhatsAppMessage): Promise<WhatsAppResult>;
  /** PR 292 — every template of the account with the provider's word on it. */
  templates?(): Promise<WhatsAppTemplateStatus[]>;
  /** PR 292 — sends a template for the provider's approval. */
  submitTemplate?(t: WhatsAppTemplateDraft): Promise<{ id: string; status: WhatsAppTemplateState }>;
}

export interface MockWhatsApp extends WhatsAppMessage {
  messageId: string;
  at: Date;
}

/** The mock outbox's size: older messages fall out. */
const OUTBOX_MAX = 200;

const G = globalThis as unknown as { __extasMockWhatsApp?: MockWhatsApp[]; __extasMockWaTemplates?: Map<string, WhatsAppTemplateState> };
const box = (): MockWhatsApp[] => (G.__extasMockWhatsApp ??= []);
const tpls = (): Map<string, WhatsAppTemplateState> => (G.__extasMockWaTemplates ??= new Map());

/** What the mock "sent" in this process (tests). */
export const mockWhatsAppOutbox = {
  all: (): readonly MockWhatsApp[] => [...box()],
  lastTo: (to: string): MockWhatsApp | undefined => [...box()].reverse().find((m) => m.to === to),
  clear: (): void => {
    box().length = 0;
    tpls().clear();
  },
};

let seq = 0;

/** The mock sender (the mock adapter, and a provider connection while it is in MOCK). */
export function mockWhatsAppSender(): WhatsAppSender {
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
    async templates() {
      // the practice "provider" approves what was sent for approval, at the next read
      const out: WhatsAppTemplateStatus[] = [];
      for (const [k, v] of tpls()) {
        const [name, language] = k.split('|') as [string, string];
        const status = v === 'PENDING' ? 'APPROVED' : v;
        tpls().set(k, status);
        out.push({ name, language, status, reason: null });
      }
      return out;
    },
    async submitTemplate(t) {
      tpls().set(`${t.name}|${t.language}`, 'PENDING');
      return { id: `mock-tpl-${t.name}-${t.language}`, status: 'PENDING' };
    },
  };
}
