// S14 · PR 291 — BulkSMSBD, a Bangladeshi SMS gateway, behind the SMS contract (provider `bulkSmsBd`). The owner types
// the API key from the gateway's panel into Keys & connections (vault name `bulkSmsBd.apiKey`) and the sender id the
// gateway gave the account (its own number, used while the shop's masking name is not approved). The Test button reads
// the account's balance, so a pass proves the key. Until then, and whenever its test fails, the connection runs on the
// mock: nothing leaves the server (A1.3).
//
// What the gateway's HTTP API offers, as far as the shop uses it: `smsapi` sends one SMS (form fields api_key, type
// text or unicode, number in 880… form, senderid, message) and answers `response_code` 202 with a `message_id`, or an
// error code with its words; `getBalanceApi` answers the balance in taka. It sends no delivery receipts back, so an SMS
// through it stays "sent" in the log (accepted by the gateway). An answer code the table below does not know is kept in
// the log's error line as it came. Codes (its documentation): 1001 the number is not valid (never tried again), 1002
// and 1013–1017 the sender id is not set up for the account, 1007 and 1006 the balance is used up or expired, 1032 the
// server's address is not on the account's allowed list. No key, number or text is ever written to a log here.
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import { mockSmsSender, type SmsBalance, type SmsResult, type SmsSender } from './contract';

export const BULKSMSBD_PROVIDER = 'bulkSmsBd';

/** The gateway's public API address; another one can be set on the connection (a test server). */
export const BULKSMSBD_DEFAULT_BASE_URL = 'https://bulksmsbd.net/api';

export const bulkSmsBdConfig = z.object({
  /** The gateway's own sender id for this account (its number), used when no masking name is approved. */
  senderId: z.string().trim().min(1).max(20),
  /** Only to point at another address than the gateway's own (a test server). HTTPS only. */
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(500).optional(),
});
export type BulkSmsBdConfig = z.output<typeof bulkSmsBdConfig>;

/** The answer codes the shop reads (anything else is kept raw in the error line). */
export const BULKSMSBD_CODES: Readonly<Record<number, { error: string; unreachable?: boolean }>> = {
  1001: { error: 'the number is not valid', unreachable: true },
  1002: { error: 'the sender id is not set up for this account' },
  1003: { error: 'a required field is missing' },
  1005: { error: 'the gateway had an internal error' },
  1006: { error: 'the balance has expired' },
  1007: { error: 'the balance is used up' },
  1011: { error: 'the account was not found' },
  1012: { error: 'a masked SMS must be in Bengali on this account' },
  1013: { error: 'the sender id has no gateway on this account' },
  1014: { error: 'the sender id has no sender type on this account' },
  1015: { error: 'the sender id has no valid gateway on this account' },
  1016: { error: 'the sender id has no active price on this account' },
  1017: { error: 'the sender id has no price on this account' },
  1018: { error: 'the account is disabled' },
  1019: { error: 'the sender type is disabled on this account' },
  1031: { error: 'the account is not verified yet' },
  1032: { error: "the server's address is not on the account's allowed list" },
};

/** Whether a text needs the gateway's unicode type (any character outside plain GSM letters: Bengali, emoji …). */
export function needsUnicode(text: string): boolean {
  // the GSM 03.38 basic set and its extension table, the same set the shop's SMS counter uses (@extas/messages pure)
  return /[^@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]/.test(text);
}

type Fetch = typeof fetch;

interface ClientOptions {
  baseUrl: string;
  apiKey: string;
  senderId: string;
  fetch?: Fetch;
}

interface Answer {
  response_code?: number | string;
  message_id?: number | string;
  success_message?: string;
  error_message?: string;
  balance?: number | string;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** The gateway's HTTP client (LIVE; a test server through `baseUrl`). */
export function createBulkSmsBdClient(opts: ClientOptions): SmsSender & { balance(): Promise<SmsBalance | null> } {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.baseUrl.replace(/\/+$/, '');

  async function ask(path: string, init: RequestInit): Promise<{ status: number; body: Answer | null }> {
    const res = await doFetch(`${base}/${path}`, { ...init, headers: { accept: 'application/json', ...(init.headers ?? {}) } });
    const raw = await res.text();
    let body: Answer | null = null;
    try {
      body = raw ? (JSON.parse(raw) as Answer) : null;
    } catch {
      body = null;
    }
    return { status: res.status, body };
  }

  return {
    async send(m): Promise<SmsResult> {
      if (!/^\+[1-9]\d{7,14}$/.test(m.to)) return { ok: false, error: 'not a phone number in +country form', unreachable: true };
      const form = new URLSearchParams({
        api_key: opts.apiKey,
        type: needsUnicode(m.text) ? 'unicode' : 'text',
        number: m.to.slice(1),
        senderid: m.senderId?.trim() || opts.senderId,
        message: m.text,
      });
      let a: { status: number; body: Answer | null };
      try {
        a = await ask('smsapi', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
      } catch (e) {
        return { ok: false, error: `the gateway did not answer (${e instanceof Error ? e.message.slice(0, 80) : 'network'})` };
      }
      const code = num(a.body?.response_code);
      if (code === 202) {
        const id = a.body?.message_id;
        return { ok: true, messageId: id === undefined || id === null || id === '' ? `bulksmsbd-${Date.now().toString(36)}` : String(id) };
      }
      if (code !== null && BULKSMSBD_CODES[code]) return { ok: false, error: `${code}: ${BULKSMSBD_CODES[code]!.error}`, ...(BULKSMSBD_CODES[code]!.unreachable ? { unreachable: true } : {}) };
      const words = (a.body?.error_message ?? '').toString().slice(0, 120);
      return { ok: false, error: code !== null ? `${code}: ${words || 'refused'}` : `HTTP ${a.status}: the gateway's answer was not understood` };
    },
    async balance(): Promise<SmsBalance | null> {
      const a = await ask(`getBalanceApi?${new URLSearchParams({ api_key: opts.apiKey }).toString()}`, { method: 'GET' });
      const code = num(a.body?.response_code);
      const taka = num(a.body?.balance);
      if (a.status >= 400 || (code !== null && code !== 202) || taka === null) {
        const known = code !== null ? BULKSMSBD_CODES[code]?.error : undefined;
        throw new Error(known ? `${code}: ${known}` : `HTTP ${a.status}: no balance in the answer`);
      }
      return { amountMinor: Math.round(taka * 100), sms: null };
    },
  };
}

export const bulkSmsBdAdapter = defineAdapter<SmsSender, BulkSmsBdConfig>({
  kind: 'SMS',
  provider: BULKSMSBD_PROVIDER,
  modes: ['LIVE'],
  secrets: ['apiKey'],
  configSchema: bulkSmsBdConfig,
  async create(ctx) {
    return createBulkSmsBdClient({ baseUrl: ctx.config.baseUrl ?? BULKSMSBD_DEFAULT_BASE_URL, apiKey: await requireSecret(ctx, 'apiKey'), senderId: ctx.config.senderId });
  },
  async mock() {
    return mockSmsSender();
  },
  async test(api, ctx) {
    if (ctx.mode === 'MOCK') return { ok: true, message: 'mock SMS: nothing leaves the server' };
    const b = await api.balance?.();
    if (!b) return { ok: false, message: 'no balance in the answer' };
    return { ok: true, message: `connected; balance ${((b.amountMinor ?? 0) / 100).toFixed(2)}` };
  },
});
