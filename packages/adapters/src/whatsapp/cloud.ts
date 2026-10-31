// S14 · PR 292 — the WhatsApp Business Platform (Meta's Cloud API) behind the WhatsApp contract (provider
// `whatsappCloud`). The owner types three secrets from the Meta app into Keys & connections — the access token, the
// app secret (the webhook's signature key) and a verify token of his choice (Meta's webhook check) — and the account's
// phone number id and business account id. The Test button reads the phone number, so a pass proves the token. Until
// then, and whenever its test fails, the connection runs on the mock: nothing leaves the server (A1.3).
//
// What the shop uses: `/<phone number id>/messages` sends one message — an approved template (name, language, the
// body's values in order) or, inside the customer's 24 hours, plain text; `/<business account id>/message_templates`
// lists the templates with Meta's word on each, and takes a new one for approval. Meta's webhook brings the delivery
// receipts (sent, delivered, read, failed) and the customer's own messages; it is signed with the app secret
// (X-Hub-Signature-256). Error 131026 means the number has no WhatsApp (never tried again). No token, number or text is
// ever written to a log here.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import { mockWhatsAppSender, WHATSAPP_TEMPLATE_STATES, type WhatsAppResult, type WhatsAppSender, type WhatsAppTemplateState, type WhatsAppTemplateStatus } from './contract';

export const WHATSAPP_CLOUD_PROVIDER = 'whatsappCloud';

/** Meta's Graph API address and the version the shop was built against; either can be set on the connection. */
export const WHATSAPP_CLOUD_DEFAULT_BASE_URL = 'https://graph.facebook.com';
export const WHATSAPP_CLOUD_DEFAULT_API_VERSION = 'v21.0';

/** The webhook's signature header (Meta). */
export const WHATSAPP_SIGNATURE_HEADER = 'x-hub-signature-256';

export const whatsappCloudConfig = z.object({
  /** The WhatsApp phone number's id in the Meta app (not the number itself). */
  phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, { message: 'digits only (the phone number id from the Meta app)' }),
  /** The WhatsApp Business account's id (its templates live there). */
  businessAccountId: z.string().trim().regex(/^\d{5,30}$/, { message: 'digits only (the business account id from the Meta app)' }),
  apiVersion: z.string().trim().regex(/^v\d{1,3}\.\d{1,2}$/, { message: 'like v21.0' }).optional(),
  /** Only to point at another address than Meta's own (a test server). HTTPS only. */
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(500).optional(),
});
export type WhatsAppCloudConfig = z.output<typeof whatsappCloudConfig>;

/** Meta's error codes the shop reads specially. */
export const WHATSAPP_CLOUD_CODES: Readonly<Record<number, { error: string; notOnWhatsApp?: boolean }>> = {
  131026: { error: 'the number cannot get WhatsApp messages', notOnWhatsApp: true },
  131047: { error: "more than 24 hours since the customer's last message: a template is needed" },
  132000: { error: "the template's values do not match its body" },
  132001: { error: 'the template does not exist in this language' },
  132015: { error: 'the template is paused' },
  132016: { error: 'the template is disabled' },
  131056: { error: 'too many messages to this number in a short time' },
  190: { error: 'the access token has expired or is not valid' },
};

type Fetch = typeof fetch;

interface ClientOptions {
  baseUrl: string;
  apiVersion: string;
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  fetch?: Fetch;
}

interface GraphError {
  code?: number;
  message?: string;
  error_data?: { details?: string };
}

const stateOf = (s: unknown): WhatsAppTemplateState => {
  const v = String(s ?? '').toUpperCase();
  return (WHATSAPP_TEMPLATE_STATES as readonly string[]).includes(v) ? (v as WhatsAppTemplateState) : v === 'IN_APPEAL' || v === 'PENDING_DELETION' ? 'PENDING' : 'REJECTED';
};

/** The Cloud API client (LIVE; a test server through `baseUrl`). */
export function createWhatsAppCloudClient(opts: ClientOptions): WhatsAppSender & { phone(): Promise<{ number: string; name: string | null }> } {
  const doFetch = opts.fetch ?? fetch;
  const base = `${opts.baseUrl.replace(/\/+$/, '')}/${opts.apiVersion}`;
  const headers = { authorization: `Bearer ${opts.accessToken}`, accept: 'application/json' };

  async function ask(url: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> | null }> {
    const res = await doFetch(url.startsWith('http') ? url : `${base}/${url}`, { ...init, headers: { ...headers, ...(init.body ? { 'content-type': 'application/json' } : {}) } });
    const raw = await res.text();
    try {
      return { status: res.status, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : null };
    } catch {
      return { status: res.status, body: null };
    }
  }
  const errorOf = (a: { status: number; body: Record<string, unknown> | null }): string => {
    const e = (a.body?.error ?? null) as GraphError | null;
    const known = e?.code !== undefined ? WHATSAPP_CLOUD_CODES[e.code] : undefined;
    if (known) return `${e!.code}: ${known.error}`;
    return e?.code !== undefined ? `${e.code}: ${(e.message ?? 'refused').slice(0, 120)}` : `HTTP ${a.status}: the answer was not understood`;
  };

  return {
    async send(m): Promise<WhatsAppResult> {
      if (!/^\+[1-9]\d{7,14}$/.test(m.to)) return { ok: false, error: 'not a phone number in +country form', notOnWhatsApp: true };
      const to = m.to.slice(1);
      const payload = m.template
        ? {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
              name: m.template.name,
              language: { code: m.template.language },
              ...(m.template.params.length ? { components: [{ type: 'body', parameters: m.template.params.map((text) => ({ type: 'text', text })) }] } : {}),
            },
          }
        : { messaging_product: 'whatsapp', to, type: 'text', text: { body: m.text, preview_url: false } };
      let a: { status: number; body: Record<string, unknown> | null };
      try {
        a = await ask(`${opts.phoneNumberId}/messages`, { method: 'POST', body: JSON.stringify(payload) });
      } catch (e) {
        return { ok: false, error: `WhatsApp did not answer (${e instanceof Error ? e.message.slice(0, 80) : 'network'})` };
      }
      const id = (a.body?.messages as { id?: string }[] | undefined)?.[0]?.id;
      if (a.status < 300 && id) return { ok: true, messageId: id };
      const code = ((a.body?.error ?? null) as GraphError | null)?.code;
      return { ok: false, error: errorOf(a), ...(code !== undefined && WHATSAPP_CLOUD_CODES[code]?.notOnWhatsApp ? { notOnWhatsApp: true } : {}) };
    },
    async templates() {
      const out: WhatsAppTemplateStatus[] = [];
      let next: string | null = `${opts.businessAccountId}/message_templates?${new URLSearchParams({ fields: 'name,language,status,rejected_reason', limit: '200' }).toString()}`;
      // at most a few pages: a shop has tens of templates, not thousands
      for (let page = 0; next && page < 10; page++) {
        const a = await ask(next);
        if (a.status >= 300) throw new Error(errorOf(a));
        for (const t of (a.body?.data as Record<string, unknown>[] | undefined) ?? []) {
          const reason = t.rejected_reason && t.rejected_reason !== 'NONE' ? String(t.rejected_reason).slice(0, 160) : null;
          out.push({ name: String(t.name ?? ''), language: String(t.language ?? ''), status: stateOf(t.status), reason });
        }
        const paging = a.body?.paging as { next?: string } | undefined;
        next = paging?.next && paging.next.startsWith(opts.baseUrl.replace(/\/+$/, '')) ? paging.next : null;
      }
      return out;
    },
    async submitTemplate(t) {
      const body = {
        name: t.name,
        language: t.language,
        category: t.category,
        components: [{ type: 'BODY', text: t.body, ...(t.examples.length ? { example: { body_text: [t.examples] } } : {}) }],
      };
      const a = await ask(`${opts.businessAccountId}/message_templates`, { method: 'POST', body: JSON.stringify(body) });
      if (a.status >= 300 || !a.body?.id) throw new Error(errorOf(a));
      return { id: String(a.body.id), status: stateOf(a.body.status ?? 'PENDING') };
    },
    async phone() {
      const a = await ask(`${opts.phoneNumberId}?fields=display_phone_number,verified_name`);
      if (a.status >= 300 || !a.body?.display_phone_number) throw new Error(errorOf(a));
      return { number: String(a.body.display_phone_number), name: a.body.verified_name ? String(a.body.verified_name) : null };
    },
  };
}

/** Whether a webhook body carries Meta's signature made with the app secret (`sha256=<hex>`), in constant time. */
export function verifyWhatsAppSignature(rawBody: string, header: string | null | undefined, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  const want = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest();
  const got = Buffer.from(m[1]!, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

/** The signature header a body would carry (tests and the practice webhook). */
export const whatsappSignature = (rawBody: string, appSecret: string): string => `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;

export interface WhatsAppReceipt {
  /** The provider's message id (the one the send answered with). */
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  at: Date;
  /** Why it failed (the provider's code and words), when it did. */
  error: string | null;
  /** The number has no WhatsApp (a failed receipt with 131026). */
  notOnWhatsApp: boolean;
}

export interface WhatsAppInbound {
  /** The customer's number in +country form. */
  from: string;
  messageId: string;
  /** The words he sent (a text, a button's title, or a file's caption); '' for a file with no caption. */
  text: string;
  at: Date;
  /** PR 426: the shop's WhatsApp number it came to (the phone number id), the name the customer's profile shows, and
   *  his files (Meta's media id; the file itself is fetched with the token when it is copied to our storage). */
  phoneNumberId?: string;
  name?: string;
  files?: { kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER'; mediaId: string; fileName?: string; contentType?: string }[];
}

/** PR 426: where a customer's WhatsApp file is read from (Meta's media address; it answers only with the token, so the
 *  file is copied to our storage by the connector that holds it, B4.8). */
export const whatsappMediaUrl = (mediaId: string, opts: { baseUrl?: string; apiVersion?: string } = {}): string =>
  `${(opts.baseUrl ?? WHATSAPP_CLOUD_DEFAULT_BASE_URL).replace(/\/+$/, '')}/${opts.apiVersion ?? WHATSAPP_CLOUD_DEFAULT_API_VERSION}/${encodeURIComponent(mediaId)}`;

const WA_FILE_KINDS: Record<string, NonNullable<WhatsAppInbound['files']>[number]['kind']> = { image: 'IMAGE', video: 'VIDEO', audio: 'AUDIO', voice: 'AUDIO', document: 'DOCUMENT', sticker: 'IMAGE' };

const RECEIPTS = new Set(['sent', 'delivered', 'read', 'failed']);
const dateOf = (s: unknown): Date => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
};

/** The receipts and the customer's messages in one webhook body (anything else in it is left alone). */
export function parseWhatsAppWebhook(body: unknown): { receipts: WhatsAppReceipt[]; inbound: WhatsAppInbound[] } {
  const receipts: WhatsAppReceipt[] = [];
  const inbound: WhatsAppInbound[] = [];
  const entries = (body as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return { receipts, inbound };
  for (const entry of entries) {
    for (const change of ((entry as { changes?: unknown[] }).changes ?? []) as { field?: string; value?: Record<string, unknown> }[]) {
      if (change.field !== 'messages' || !change.value) continue;
      for (const s of (change.value.statuses ?? []) as Record<string, unknown>[]) {
        const status = String(s.status ?? '');
        if (!RECEIPTS.has(status) || typeof s.id !== 'string') continue;
        const err = ((s.errors ?? []) as { code?: number; title?: string; message?: string }[])[0];
        receipts.push({
          messageId: s.id,
          status: status as WhatsAppReceipt['status'],
          at: dateOf(s.timestamp),
          error: err ? `${err.code ?? ''}: ${(err.code !== undefined ? WHATSAPP_CLOUD_CODES[err.code]?.error : undefined) ?? (err.title ?? err.message ?? 'failed').slice(0, 120)}` : null,
          notOnWhatsApp: err?.code !== undefined && WHATSAPP_CLOUD_CODES[err.code]?.notOnWhatsApp === true,
        });
      }
      const phoneNumberId = (change.value.metadata as { phone_number_id?: unknown } | undefined)?.phone_number_id;
      const names = new Map(((change.value.contacts ?? []) as { wa_id?: unknown; profile?: { name?: unknown } }[]).flatMap((c) => (typeof c.wa_id === 'string' && typeof c.profile?.name === 'string' ? [[c.wa_id, c.profile.name.slice(0, 120)] as const] : [])));
      for (const m of (change.value.messages ?? []) as Record<string, unknown>[]) {
        if (typeof m.from !== 'string' || typeof m.id !== 'string') continue;
        const media = typeof m.type === 'string' ? (m[m.type] as { id?: unknown; caption?: unknown; filename?: unknown; mime_type?: unknown } | undefined) : undefined;
        const fileKind = typeof m.type === 'string' ? WA_FILE_KINDS[m.type] : undefined;
        const files = fileKind && typeof media?.id === 'string' ? [{ kind: fileKind, mediaId: media.id, ...(typeof media.filename === 'string' ? { fileName: media.filename.slice(0, 300) } : {}), ...(typeof media.mime_type === 'string' ? { contentType: media.mime_type.slice(0, 120) } : {}) }] : [];
        const text =
          (m.text as { body?: string } | undefined)?.body ??
          (m.button as { text?: string } | undefined)?.text ??
          (m.interactive as { button_reply?: { title?: string }; list_reply?: { title?: string } } | undefined)?.button_reply?.title ??
          (m.interactive as { list_reply?: { title?: string } } | undefined)?.list_reply?.title ??
          (typeof media?.caption === 'string' ? media.caption : '');
        const name = names.get(m.from);
        inbound.push({ from: `+${m.from.replace(/^\+/, '')}`, messageId: m.id, text: String(text).slice(0, 1000), at: dateOf(m.timestamp), ...(typeof phoneNumberId === 'string' ? { phoneNumberId } : {}), ...(name ? { name } : {}), ...(files.length ? { files } : {}) });
      }
    }
  }
  return { receipts, inbound };
}

export const whatsappCloudAdapter = defineAdapter<WhatsAppSender, WhatsAppCloudConfig>({
  kind: 'WHATSAPP',
  provider: WHATSAPP_CLOUD_PROVIDER,
  modes: ['LIVE'],
  secrets: ['accessToken', 'appSecret', 'verifyToken'],
  configSchema: whatsappCloudConfig,
  async create(ctx) {
    return createWhatsAppCloudClient({
      baseUrl: ctx.config.baseUrl ?? WHATSAPP_CLOUD_DEFAULT_BASE_URL,
      apiVersion: ctx.config.apiVersion ?? WHATSAPP_CLOUD_DEFAULT_API_VERSION,
      accessToken: await requireSecret(ctx, 'accessToken'),
      phoneNumberId: ctx.config.phoneNumberId,
      businessAccountId: ctx.config.businessAccountId,
    });
  },
  async mock() {
    return mockWhatsAppSender();
  },
  async test(api, ctx) {
    if (ctx.mode === 'MOCK') return { ok: true, message: 'mock WhatsApp: nothing leaves the server' };
    const p = await (api as ReturnType<typeof createWhatsAppCloudClient>).phone?.();
    if (!p) return { ok: false, message: 'no phone number in the answer' };
    return { ok: true, message: `connected; ${p.number}${p.name ? ` (${p.name})` : ''}` };
  },
});
