// S22 · PR 426 — Facebook Messenger (the Page's messages, Meta's Messenger Platform) for the Support inbox (Blueprint
// B4.2, B4.10). The owner types three secrets from the Meta app into Keys & connections — the Page access token, the
// app secret (the webhook's signature key) and a verify token of his choice (Meta's webhook check) — and the Page id.
// The Test button reads the Page, so a pass proves the token. Until then, and whenever its test fails, the connection
// runs on the mock: nothing leaves the server (A1.3); the mock keeps what it "sent" in a small outbox (this process).
//
// What the shop uses: `POST /<page id>/messages` sends one text reply to a person (`messaging_type: RESPONSE`, only
// inside Meta's window after the person's last message: the support core checks the window first and never sends
// outside it; B4.10 "replies only inside the allowed window"); Meta's webhook brings the person's messages, signed with
// the app secret (X-Hub-Signature-256, the same HMAC as WhatsApp). Messages stay in the Page inbox and Business Suite
// as well: nothing here hides or deletes them. No token, id or text is ever written to a log here.
import { z } from 'zod';
import { defineAdapter, requireSecret, AdapterError } from '../define';

export const MESSENGER_PAGE_PROVIDER = 'messengerPage';
export const MESSENGER_DEFAULT_BASE_URL = 'https://graph.facebook.com';
export const MESSENGER_DEFAULT_API_VERSION = 'v21.0';
/** Meta signs every webhook post with the app secret, as for WhatsApp (verifyWhatsAppSignature checks both). */
export const MESSENGER_SIGNATURE_HEADER = 'x-hub-signature-256';

export const messengerPageConfig = z.object({
  /** The Facebook Page's id (digits). */
  pageId: z.string().trim().regex(/^\d{5,30}$/, { message: 'digits only (the Page id from the Meta app)' }),
  apiVersion: z.string().trim().regex(/^v\d{1,3}\.\d{1,2}$/, { message: 'like v21.0' }).optional(),
  /** Only to point at another address than Meta's own (a test server). HTTPS only. */
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(500).optional(),
});
export type MessengerPageConfig = z.output<typeof messengerPageConfig>;

export interface MessengerMessage {
  /** The person's page-scoped id (PSID). */
  to: string;
  text: string;
}

export type MessengerResult = { ok: true; messageId: string } | { ok: false; error: string };

export interface MessengerSender {
  send(m: MessengerMessage): Promise<MessengerResult>;
}

/** Meta's error codes the shop reads specially. */
export const MESSENGER_CODES: Readonly<Record<number, string>> = {
  10: 'outside the allowed window after the person`s last message',
  551: 'this person cannot get messages from the Page now',
  190: 'the Page access token has expired or is not valid',
  613: 'too many messages in a short time',
};

export interface MockMessenger extends MessengerMessage {
  messageId: string;
  at: Date;
}
const OUTBOX_MAX = 200;
const G = globalThis as unknown as { __extasMockMessenger?: MockMessenger[] };
const box = (): MockMessenger[] => (G.__extasMockMessenger ??= []);
let seq = 0;

/** What the mock "sent" in this process (tests and the practice screen). */
export const mockMessengerOutbox = {
  all: (): readonly MockMessenger[] => [...box()],
  lastTo: (to: string): MockMessenger | undefined => [...box()].reverse().find((m) => m.to === to),
  clear: (): void => {
    box().length = 0;
  },
};

/** The mock sender: nothing leaves the server. */
export function mockMessengerSender(): MessengerSender {
  return {
    async send(m) {
      if (!m.to || !m.text.trim()) return { ok: false, error: 'a reply needs a person and words' };
      seq += 1;
      const messageId = `mock-ms-${Date.now().toString(36)}-${seq}`;
      const b = box();
      b.push({ ...m, messageId, at: new Date() });
      if (b.length > OUTBOX_MAX) b.splice(0, b.length - OUTBOX_MAX);
      return { ok: true, messageId };
    },
  };
}

type Fetch = typeof fetch;

/** The Messenger Platform client (LIVE; a test server through `baseUrl`). */
export function createMessengerClient(opts: { baseUrl: string; apiVersion: string; accessToken: string; pageId: string; fetch?: Fetch }): MessengerSender & { page(): Promise<{ name: string }> } {
  const doFetch = opts.fetch ?? fetch;
  const base = `${opts.baseUrl.replace(/\/+$/, '')}/${opts.apiVersion}`;
  async function ask(path: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> | null }> {
    const res = await doFetch(`${base}/${path}`, { ...init, headers: { authorization: `Bearer ${opts.accessToken}`, accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}) } });
    const raw = await res.text();
    try {
      return { status: res.status, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : null };
    } catch {
      return { status: res.status, body: null };
    }
  }
  const errorOf = (a: { status: number; body: Record<string, unknown> | null }): string => {
    const e = (a.body?.error ?? null) as { code?: number; message?: string } | null;
    if (e?.code !== undefined) return `${e.code}: ${MESSENGER_CODES[e.code] ?? (e.message ?? 'refused').slice(0, 120)}`;
    return `HTTP ${a.status}: the answer was not understood`;
  };
  return {
    async send(m) {
      let a: { status: number; body: Record<string, unknown> | null };
      try {
        a = await ask(`${opts.pageId}/messages`, { method: 'POST', body: JSON.stringify({ recipient: { id: m.to }, messaging_type: 'RESPONSE', message: { text: m.text } }) });
      } catch (e) {
        return { ok: false, error: `Messenger did not answer (${e instanceof Error ? e.message.slice(0, 80) : 'network'})` };
      }
      const id = a.body?.message_id;
      return a.status < 300 && typeof id === 'string' ? { ok: true, messageId: id } : { ok: false, error: errorOf(a) };
    },
    async page() {
      const a = await ask(`${opts.pageId}?fields=name`);
      if (a.status >= 300 || !a.body?.name) throw new Error(errorOf(a));
      return { name: String(a.body.name) };
    },
  };
}

/** One message a person sent to the Page, from Meta's webhook. */
export interface MessengerInbound {
  /** The Page that got it. */
  pageId: string;
  /** The person (PSID). */
  from: string;
  messageId: string;
  text: string;
  files: { kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER'; url: string }[];
  at: Date;
}

const FILE_KINDS: Record<string, MessengerInbound['files'][number]['kind']> = { image: 'IMAGE', video: 'VIDEO', audio: 'AUDIO', file: 'DOCUMENT' };

/** The person's messages in a webhook body (echoes of the Page's own replies, reads and deliveries are left out). */
export function parseMessengerWebhook(body: unknown): MessengerInbound[] {
  const out: MessengerInbound[] = [];
  const b = body as { object?: unknown; entry?: unknown[] } | null;
  if (b?.object !== 'page' || !Array.isArray(b.entry)) return out;
  for (const entry of b.entry as { id?: unknown; messaging?: unknown[] }[]) {
    for (const ev of (entry.messaging ?? []) as Record<string, unknown>[]) {
      const msg = ev.message as { mid?: unknown; text?: unknown; is_echo?: unknown; attachments?: { type?: unknown; payload?: { url?: unknown } }[] } | undefined;
      const from = (ev.sender as { id?: unknown } | undefined)?.id;
      const pageId = (ev.recipient as { id?: unknown } | undefined)?.id ?? entry.id;
      if (!msg || msg.is_echo || typeof msg.mid !== 'string' || typeof from !== 'string' || typeof pageId !== 'string') continue;
      const files = (msg.attachments ?? []).flatMap((a) => {
        const url = a.payload?.url;
        return typeof url === 'string' && /^https:\/\//.test(url) ? [{ kind: FILE_KINDS[String(a.type)] ?? 'OTHER', url: url.slice(0, 2000) }] : [];
      });
      const ts = Number(ev.timestamp);
      out.push({ pageId, from, messageId: msg.mid, text: typeof msg.text === 'string' ? msg.text.slice(0, 8000) : '', files, at: Number.isFinite(ts) && ts > 0 ? new Date(ts) : new Date() });
    }
  }
  return out;
}

export const mockMessengerAdapter = defineAdapter<MessengerSender, Record<string, never>>({
  kind: 'MESSENGER',
  provider: 'mockMessenger',
  modes: [],
  secrets: [],
  configSchema: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
  async create() {
    throw new AdapterError('no Messenger Page is connected yet; the mock serves until its key is entered');
  },
  async mock() {
    return mockMessengerSender();
  },
  async test() {
    return { ok: true, message: 'mock Messenger: nothing leaves the server' };
  },
});

export const messengerPageAdapter = defineAdapter<MessengerSender, MessengerPageConfig>({
  kind: 'MESSENGER',
  provider: MESSENGER_PAGE_PROVIDER,
  modes: ['LIVE'],
  secrets: ['pageAccessToken', 'appSecret', 'verifyToken'],
  configSchema: messengerPageConfig,
  async create(ctx) {
    return createMessengerClient({
      baseUrl: ctx.config.baseUrl ?? MESSENGER_DEFAULT_BASE_URL,
      apiVersion: ctx.config.apiVersion ?? MESSENGER_DEFAULT_API_VERSION,
      accessToken: await requireSecret(ctx, 'pageAccessToken'),
      pageId: ctx.config.pageId,
    });
  },
  async mock() {
    return mockMessengerSender();
  },
  async test(api, ctx) {
    if (ctx.mode === 'MOCK') return { ok: true, message: 'mock Messenger: nothing leaves the server' };
    const p = await (api as ReturnType<typeof createMessengerClient>).page?.();
    if (!p) return { ok: false, message: 'no Page in the answer' };
    return { ok: true, message: `connected; Page ${p.name}` };
  },
});

export const messengerAdapters = [mockMessengerAdapter, messengerPageAdapter] as const;
/** The Messenger providers with a LIVE mode (Keys & connections lists them; the mock is not one). */
export const liveMessengerAdapters = [messengerPageAdapter] as const;
