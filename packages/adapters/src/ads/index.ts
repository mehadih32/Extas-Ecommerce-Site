// S13 · PR 257 (Blueprint C6.2) — the ad platforms' server event APIs: Meta's Conversions API, Google Analytics 4's
// Measurement Protocol and TikTok's Events API. The shop's own server tells them what a shopper did (a product seen,
// an item put in the bag, the checkout opened, an order placed) with the value, the category, the size and the colour,
// and the same event id a browser pixel would send, so each platform counts the event once.
//
// - One platform-neutral event (`AdEvent`); each client turns it into its platform's own shape (`metaPayload`,
//   `googleEvents`, `tiktokPayload`), so the mock can show exactly what would have been sent.
// - A customer's phone and e-mail arrive here already hashed (sha256; the web app hashes them, and only while the owner
//   allows matching). Nothing here ever sees a name, an address or a raw phone number.
// - Until the owner types a platform's key into Keys & connections and its test passes, the mock answers: it keeps the
//   newest payloads in this process and sends nothing anywhere (A1.3).
// - No key ever appears in an error: Meta and TikTok take the token in a header; Google's secret is part of its address
//   (its own design), so a failure is said in words and never carries the address.
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';

export const AD_EVENT_NAMES = ['view', 'addToBag', 'checkout', 'purchase'] as const;
/** PR 258 (C6.2 point 1): the order's own steps, and "placed" — the order placed while the owner counts a purchase at
 *  the delivery (the delivered event then goes under the platform's purchase name, `purchase`). */
export const AD_ORDER_EVENT_NAMES = ['placed', 'confirmed', 'delivered'] as const;
export type AdEventName = (typeof AD_EVENT_NAMES)[number] | (typeof AD_ORDER_EVENT_NAMES)[number];
export type AdPlatform = 'meta' | 'google' | 'tiktok';

export interface AdItem {
  /** The product's id at the shop (the same id a catalogue feed would carry). */
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  colour: string | null;
  size: string | null;
  quantity: number;
  /** One piece's price in the currency's major unit (taka), or null when unknown. */
  price: number | null;
}

/** sha256 hashes (lower-case hex) and the platforms' own cookies; never a raw phone, e-mail or name. */
export interface AdUser {
  /** sha256 of the e-mail, trimmed and lower-cased. */
  em?: string;
  /** sha256 of the phone's digits with the country code, no plus (Meta). */
  ph?: string;
  /** sha256 of the phone in +country form (Google, TikTok). */
  phPlus?: string;
  /** sha256 of the shop's own visitor or customer id. */
  ext?: string;
  /** Meta's browser cookies, when a Meta pixel set them. */
  fbp?: string;
  fbc?: string;
  /** TikTok's browser cookie, when a TikTok pixel set it. */
  ttp?: string;
  /** Google's client id (from the `_ga` cookie), else the shop's own. */
  gaClientId?: string;
  /** The shopper's browser name (`client_user_agent`). */
  ua?: string;
}

export interface AdEvent {
  eventId: string;
  name: AdEventName;
  at: Date;
  /** The full shop address the event happened on. */
  url: string | null;
  value: number | null;
  currency: string | null;
  items: AdItem[];
  /** The order number (purchase only). */
  orderNumber: string | null;
  user: AdUser;
  /** PR 258: an order step with no browser behind it (no browser name): Meta's `system_generated`, not `website`. */
  system?: boolean;
}

export type AdSendResult = { ok: true; sent: number } | { ok: false; error: string };

export interface AdEventSender {
  provider: string;
  platform: AdPlatform;
  /** Sends a batch; `test` marks every event as a test (the platform's test view, never counted). */
  send(events: readonly AdEvent[], o?: { test?: boolean }): Promise<AdSendResult>;
  /** The Test button's round trip; absent on the mock. */
  check?(): Promise<{ ok: boolean; message: string }>;
}

// --- the platforms' event names ---------------------------------------------------------------------------------

// PR 258: the order steps are custom events on Meta and Google, and on TikTok too except "placed" (its own PlaceAnOrder).
export const META_EVENT: Record<AdEventName, string> = { view: 'ViewContent', addToBag: 'AddToCart', checkout: 'InitiateCheckout', purchase: 'Purchase', placed: 'OrderPlaced', confirmed: 'OrderConfirmed', delivered: 'OrderDelivered' };
export const GOOGLE_EVENT: Record<AdEventName, string> = { view: 'view_item', addToBag: 'add_to_cart', checkout: 'begin_checkout', purchase: 'purchase', placed: 'order_placed', confirmed: 'order_confirmed', delivered: 'order_delivered' };
export const TIKTOK_EVENT: Record<AdEventName, string> = { view: 'ViewContent', addToBag: 'AddToCart', checkout: 'InitiateCheckout', purchase: 'CompletePayment', placed: 'PlaceAnOrder', confirmed: 'OrderConfirmed', delivered: 'OrderDelivered' };

const variantOf = (i: AdItem) => [i.colour, i.size].filter(Boolean).join(' / ') || undefined;
const drop = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T;
const seconds = (d: Date) => Math.floor(d.getTime() / 1000);
const categoryOf = (e: AdEvent) => [...new Set(e.items.map((i) => i.category).filter(Boolean))].join(', ') || undefined;

/** Meta Conversions API: the request body for a batch (without the token, which travels in a header). */
export function metaPayload(events: readonly AdEvent[], o: { testEventCode?: string | null } = {}) {
  return drop({
    data: events.map((e) =>
      drop({
        event_name: META_EVENT[e.name],
        event_time: seconds(e.at),
        event_id: e.eventId,
        action_source: e.system ? 'system_generated' : 'website',
        event_source_url: e.url ?? undefined,
        user_data: drop({
          em: e.user.em ? [e.user.em] : undefined,
          ph: e.user.ph ? [e.user.ph] : undefined,
          external_id: e.user.ext ? [e.user.ext] : undefined,
          fbp: e.user.fbp,
          fbc: e.user.fbc,
          client_user_agent: e.user.ua,
        }),
        custom_data: drop({
          value: e.value ?? undefined,
          currency: e.currency ?? undefined,
          content_type: 'product',
          content_ids: e.items.map((i) => i.id),
          content_category: categoryOf(e),
          contents: e.items.map((i) => drop({ id: i.id, quantity: i.quantity, item_price: i.price ?? undefined })),
          num_items: e.name === 'view' ? undefined : e.items.reduce((n, i) => n + i.quantity, 0),
          order_id: e.orderNumber ?? undefined,
        }),
      }),
    ),
    test_event_code: o.testEventCode || undefined,
  });
}

/** Google Analytics 4 Measurement Protocol: one request body per event (each carries its own client id). */
export function googleEvents(events: readonly AdEvent[], o: { test?: boolean } = {}) {
  return events.map((e) =>
    drop({
      client_id: e.user.gaClientId ?? e.user.ext ?? e.eventId,
      timestamp_micros: e.at.getTime() * 1000,
      user_data: e.user.em || e.user.phPlus ? drop({ sha256_email_address: e.user.em ? [e.user.em] : undefined, sha256_phone_number: e.user.phPlus ? [e.user.phPlus] : undefined }) : undefined,
      events: [
        {
          name: GOOGLE_EVENT[e.name],
          params: drop({
            currency: e.currency ?? undefined,
            value: e.value ?? undefined,
            transaction_id: e.orderNumber ?? undefined,
            event_id: e.eventId,
            page_location: e.url ?? undefined,
            debug_mode: o.test ? true : undefined,
            items: e.items.map((i) => drop({ item_id: i.id, item_name: i.name, item_category: i.category ?? undefined, item_variant: variantOf(i), quantity: i.quantity, price: i.price ?? undefined })),
          }),
        },
      ],
    }),
  );
}

/** TikTok Events API 1.3: the request body for a batch (the token travels in a header). */
export function tiktokPayload(events: readonly AdEvent[], o: { pixelCode: string; testEventCode?: string | null }) {
  return drop({
    event_source: 'web',
    event_source_id: o.pixelCode,
    test_event_code: o.testEventCode || undefined,
    data: events.map((e) =>
      drop({
        event: TIKTOK_EVENT[e.name],
        event_time: seconds(e.at),
        event_id: e.eventId,
        user: drop({ email: e.user.em, phone: e.user.phPlus, external_id: e.user.ext, ttp: e.user.ttp, user_agent: e.user.ua }),
        page: e.url ? { url: e.url } : undefined,
        properties: drop({
          currency: e.currency ?? undefined,
          value: e.value ?? undefined,
          content_type: 'product',
          order_id: e.orderNumber ?? undefined,
          contents: e.items.map((i) => drop({ content_id: i.id, content_name: i.name, content_category: i.category ?? undefined, quantity: i.quantity, price: i.price ?? undefined })),
        }),
      }),
    ),
  });
}

// --- the mock ------------------------------------------------------------------------------------------------------

export interface MockAdSend {
  at: Date;
  provider: string;
  platform: AdPlatform;
  test: boolean;
  eventIds: string[];
  /** What the live client would have sent (the token is never part of it). */
  payload: unknown;
}

const G = globalThis as unknown as { __extasMockAds?: MockAdSend[] };
const outbox = (): MockAdSend[] => (G.__extasMockAds ??= []);
/** The mock keeps this many sends (the newest). */
const MOCK_KEEP = 200; // hardcode-ok: an in-memory practice list, not a business number

/** What the mocks were asked to send in this process (tests, the admin's test event). */
export const mockAdOutbox = {
  all: (): readonly MockAdSend[] => [...outbox()],
  clear: (): void => {
    outbox().length = 0;
  },
};

function mockSender(provider: string, platform: AdPlatform, build: (events: readonly AdEvent[], test: boolean) => unknown): AdEventSender {
  return {
    provider,
    platform,
    async send(events, o = {}) {
      const all = outbox();
      all.push({ at: new Date(), provider, platform, test: Boolean(o.test), eventIds: events.map((e) => e.eventId), payload: build(events, Boolean(o.test)) });
      if (all.length > MOCK_KEEP) all.splice(0, all.length - MOCK_KEEP);
      return { ok: true, sent: events.length };
    },
  };
}

// --- the live clients ----------------------------------------------------------------------------------------------

const https = z.url({ protocol: /^https$/, message: 'not an https address' }).max(500);
const testCode = z.string().trim().min(1).max(60).regex(/^[A-Za-z0-9_-]+$/, { message: 'letters and digits only' });

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** A test event with no test event code on the connection is not sent: the platform would count it as real. */
export const NO_TEST_CODE = 'no test event code on this connection (Keys & connections): a test event would count as a real one, so it was not sent';

const said = (v: unknown, secret: string): string => (typeof v === 'string' ? v.replaceAll(secret, '…').slice(0, 200) : '');

/** Meta's Graph API address; another one can be set on the connection (a test server). */
export const META_DEFAULT_BASE_URL = 'https://graph.facebook.com';
/** The Graph API version the shop was built with; the connection may name a newer one. */
export const META_DEFAULT_API_VERSION = 'v21.0';
export const META_CONVERSIONS_PROVIDER = 'metaConversions';

export const metaConversionsConfig = z.object({
  /** The dataset (pixel) id from Meta Events Manager. */
  pixelId: z.string().trim().regex(/^\d{5,20}$/, { message: 'the pixel id is a number' }),
  /** Events Manager → Test events: while set, every event shows there and is not counted. */
  testEventCode: testCode.optional(),
  apiVersion: z.string().trim().regex(/^v\d{1,3}\.\d{1,2}$/, { message: 'like v21.0' }).optional(),
  baseUrl: https.optional(),
});
export type MetaConversionsConfig = z.output<typeof metaConversionsConfig>;

export function createMetaClient(o: { baseUrl: string; apiVersion: string; pixelId: string; token: string; testEventCode?: string | null; fetch?: typeof fetch }): AdEventSender & { check(): Promise<{ ok: boolean; message: string }> } {
  const doFetch = o.fetch ?? fetch;
  const base = `${o.baseUrl.replace(/\/+$/, '')}/${o.apiVersion}/${o.pixelId}`;
  const headers = { Authorization: `Bearer ${o.token}`, 'Content-Type': 'application/json' };
  const why = (b: Record<string, unknown>) => said((b.error as { message?: unknown } | undefined)?.message, o.token);
  return {
    provider: META_CONVERSIONS_PROVIDER,
    platform: 'meta',
    async send(events, opt = {}) {
      if (!events.length) return { ok: true, sent: 0 };
      // qa-gate: without a test event code Meta counts a "test" as a real event (a fake order in the ad reports)
      if (opt.test && !o.testEventCode) return { ok: false, error: NO_TEST_CODE };
      try {
        const res = await doFetch(`${base}/events`, { method: 'POST', headers, body: JSON.stringify(metaPayload(events, { testEventCode: opt.test ? o.testEventCode : null })) });
        const b = await readJson(res);
        if (!res.ok) return { ok: false, error: `Meta refused (${res.status})${why(b) ? `: ${why(b)}` : ''}` };
        return { ok: true, sent: typeof b.events_received === 'number' ? b.events_received : events.length };
      } catch {
        return { ok: false, error: 'Meta did not answer' };
      }
    },
    async check() {
      try {
        const res = await doFetch(`${base}?fields=name`, { method: 'GET', headers });
        const b = await readJson(res);
        if (!res.ok) return { ok: false, message: `Meta refused (${res.status})${why(b) ? `: ${why(b)}` : ''}` };
        return { ok: true, message: `connected; pixel ${typeof b.name === 'string' ? b.name : o.pixelId}` };
      } catch {
        return { ok: false, message: 'Meta did not answer' };
      }
    },
  };
}

/** Google Analytics 4's collection address; the EU one (region1) or a test server can be set on the connection. */
export const GOOGLE_ANALYTICS_DEFAULT_BASE_URL = 'https://www.google-analytics.com';
export const GOOGLE_ANALYTICS_PROVIDER = 'googleAnalytics';

export const googleAnalyticsConfig = z.object({
  /** The web stream's measurement id (Admin → Data streams), like G-ABC123XYZ. */
  measurementId: z.string().trim().regex(/^G-[A-Z0-9]{4,16}$/, { message: 'like G-ABC123XYZ' }),
  baseUrl: https.optional(),
});
export type GoogleAnalyticsConfig = z.output<typeof googleAnalyticsConfig>;

export function createGoogleClient(o: { baseUrl: string; measurementId: string; apiSecret: string; fetch?: typeof fetch }): AdEventSender & { check(): Promise<{ ok: boolean; message: string }> } {
  const doFetch = o.fetch ?? fetch;
  const at = (path: string) => `${o.baseUrl.replace(/\/+$/, '')}/${path}?measurement_id=${encodeURIComponent(o.measurementId)}&api_secret=${encodeURIComponent(o.apiSecret)}`;
  const post = (path: string, body: unknown) => doFetch(at(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return {
    provider: GOOGLE_ANALYTICS_PROVIDER,
    platform: 'google',
    async send(events, opt = {}) {
      let sent = 0;
      for (const body of googleEvents(events, { test: opt.test })) {
        try {
          // qa-gate: a test event goes only to the checking address (validated, never counted in the reports)
          const res = await post(opt.test ? 'debug/mp/collect' : 'mp/collect', body);
          if (!res.ok) return { ok: false, error: `Google refused (${res.status})` };
          sent += 1;
        } catch {
          return { ok: false, error: 'Google did not answer' };
        }
      }
      return { ok: true, sent };
    },
    async check() {
      const sample: AdEvent = { eventId: 'connection-test', name: 'view', at: new Date(), url: null, value: null, currency: null, items: [], orderNumber: null, user: { ext: 'connection-test' } };
      try {
        const res = await post('debug/mp/collect', googleEvents([sample], { test: true })[0]);
        const b = await readJson(res);
        const msgs = Array.isArray(b.validationMessages) ? (b.validationMessages as { description?: unknown }[]) : [];
        if (!res.ok) return { ok: false, message: `Google refused (${res.status})` };
        if (msgs.length) return { ok: false, message: `Google: ${said(msgs[0]?.description, o.apiSecret)}` };
        return { ok: true, message: `connected; stream ${o.measurementId} (Google checks the secret when events arrive: see Realtime)` };
      } catch {
        return { ok: false, message: 'Google did not answer' };
      }
    },
  };
}

/** TikTok's Business API address; another one can be set on the connection (a test server). */
export const TIKTOK_DEFAULT_BASE_URL = 'https://business-api.tiktok.com';
export const TIKTOK_EVENTS_PROVIDER = 'tiktokEvents';

export const tiktokEventsConfig = z.object({
  /** The pixel code from TikTok Events Manager. */
  pixelCode: z.string().trim().regex(/^[A-Z0-9]{10,30}$/, { message: 'the pixel code is capital letters and digits' }),
  /** Events Manager → Test events: the Test button needs it, and while set test events show there. */
  testEventCode: testCode.optional(),
  baseUrl: https.optional(),
});
export type TiktokEventsConfig = z.output<typeof tiktokEventsConfig>;

export function createTiktokClient(o: { baseUrl: string; pixelCode: string; token: string; testEventCode?: string | null; fetch?: typeof fetch }): AdEventSender & { check(): Promise<{ ok: boolean; message: string }> } {
  const doFetch = o.fetch ?? fetch;
  const url = `${o.baseUrl.replace(/\/+$/, '')}/open_api/v1.3/event/track/`;
  async function post(events: readonly AdEvent[], testEventCode: string | null): Promise<AdSendResult> {
    try {
      const res = await doFetch(url, { method: 'POST', headers: { 'Access-Token': o.token, 'Content-Type': 'application/json' }, body: JSON.stringify(tiktokPayload(events, { pixelCode: o.pixelCode, testEventCode })) });
      const b = await readJson(res);
      if (!res.ok || b.code !== 0) return { ok: false, error: `TikTok refused (${res.status})${said(b.message, o.token) ? `: ${said(b.message, o.token)}` : ''}` };
      return { ok: true, sent: events.length };
    } catch {
      return { ok: false, error: 'TikTok did not answer' };
    }
  }
  return {
    provider: TIKTOK_EVENTS_PROVIDER,
    platform: 'tiktok',
    async send(events, opt = {}) {
      if (!events.length) return { ok: true, sent: 0 };
      // qa-gate: without a test event code TikTok counts a "test" as a real event
      if (opt.test && !o.testEventCode) return { ok: false, error: NO_TEST_CODE };
      return post(events, opt.test ? o.testEventCode! : null);
    },
    async check() {
      // TikTok has no cheap read with this token: the test sends one test event, which shows only under Test events
      if (!o.testEventCode) return { ok: false, message: 'type the test event code from TikTok Events Manager → Test events, then test again' };
      const r = await post([{ eventId: 'connection-test', name: 'view', at: new Date(), url: null, value: null, currency: null, items: [], orderNumber: null, user: {} }], o.testEventCode);
      return r.ok ? { ok: true, message: `connected; pixel ${o.pixelCode} (a test event is under Test events)` } : { ok: false, message: r.error };
    },
  };
}

// --- the adapter definitions -----------------------------------------------------------------------------------------

type Checked = AdEventSender & { check?: () => Promise<{ ok: boolean; message: string }> };
const testOf = async (api: Checked, mode: string, name: string) => {
  if (mode === 'MOCK' || !api.check) return { ok: true, message: `mock ${name}: nothing leaves the server` };
  return api.check();
};

export const metaConversionsAdapter = defineAdapter<Checked, MetaConversionsConfig>({
  kind: 'META',
  provider: META_CONVERSIONS_PROVIDER,
  modes: ['LIVE'],
  secrets: ['accessToken'],
  configSchema: metaConversionsConfig,
  async create(ctx) {
    return createMetaClient({ baseUrl: ctx.config.baseUrl ?? META_DEFAULT_BASE_URL, apiVersion: ctx.config.apiVersion ?? META_DEFAULT_API_VERSION, pixelId: ctx.config.pixelId, token: await requireSecret(ctx, 'accessToken'), testEventCode: ctx.config.testEventCode });
  },
  async mock(ctx) {
    return mockSender(META_CONVERSIONS_PROVIDER, 'meta', (events, test) => metaPayload(events, { testEventCode: test ? (ctx.config?.testEventCode ?? null) : null }));
  },
  test: (api, ctx) => testOf(api, ctx.mode, 'Meta'),
});

export const googleAnalyticsAdapter = defineAdapter<Checked, GoogleAnalyticsConfig>({
  kind: 'GOOGLE',
  provider: GOOGLE_ANALYTICS_PROVIDER,
  modes: ['LIVE'],
  secrets: ['apiSecret'],
  configSchema: googleAnalyticsConfig,
  async create(ctx) {
    return createGoogleClient({ baseUrl: ctx.config.baseUrl ?? GOOGLE_ANALYTICS_DEFAULT_BASE_URL, measurementId: ctx.config.measurementId, apiSecret: await requireSecret(ctx, 'apiSecret') });
  },
  async mock() {
    return mockSender(GOOGLE_ANALYTICS_PROVIDER, 'google', (events, test) => googleEvents(events, { test }));
  },
  test: (api, ctx) => testOf(api, ctx.mode, 'Google'),
});

export const tiktokEventsAdapter = defineAdapter<Checked, TiktokEventsConfig>({
  kind: 'TIKTOK',
  provider: TIKTOK_EVENTS_PROVIDER,
  modes: ['LIVE'],
  secrets: ['accessToken'],
  configSchema: tiktokEventsConfig,
  async create(ctx) {
    return createTiktokClient({ baseUrl: ctx.config.baseUrl ?? TIKTOK_DEFAULT_BASE_URL, pixelCode: ctx.config.pixelCode, token: await requireSecret(ctx, 'accessToken'), testEventCode: ctx.config.testEventCode });
  },
  async mock(ctx) {
    return mockSender(TIKTOK_EVENTS_PROVIDER, 'tiktok', (events, test) => tiktokPayload(events, { pixelCode: ctx.config?.pixelCode ?? 'MOCK', testEventCode: test ? (ctx.config?.testEventCode ?? null) : null }));
  },
  test: (api, ctx) => testOf(api, ctx.mode, 'TikTok'),
});

/** The platform of each connection: what `ads.tracking`'s platforms name. */
export const AD_PLATFORM_CONNECTION: Record<AdPlatform, { kind: 'META' | 'GOOGLE' | 'TIKTOK'; provider: string }> = {
  meta: { kind: 'META', provider: META_CONVERSIONS_PROVIDER },
  google: { kind: 'GOOGLE', provider: GOOGLE_ANALYTICS_PROVIDER },
  tiktok: { kind: 'TIKTOK', provider: TIKTOK_EVENTS_PROVIDER },
};

export const adEventAdapters = [metaConversionsAdapter, googleAnalyticsAdapter, tiktokEventsAdapter] as const;
