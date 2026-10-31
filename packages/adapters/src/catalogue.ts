// PR 500 — the "Keys & connections" catalogue: one declaration per provider the admin page lists, as data. The page
// draws its rows from this list (never from hand-written markup), and the admin API checks every save against it.
//
// - `adapter: true` rows have an adapter in `allAdapters`: the owner can type their keys, the Test button runs, and a
//   passing test moves the connection out of MOCK. Their secret fields must be exactly the adapter's `secrets`
//   (checked by test/catalogue.test.ts).
// - `adapter: false` rows are integrations the blueprint needs whose adapter comes with a later PR (Google Drive
//   backup PR 8/395, ~~Cloudflare PR 602~~ built, ~~Telegram PR 9~~ built with PR 392). They show as "not connected" with no button: nothing pretends
//   to work before its code exists.
// - Labels are keys into the admin messages files (apps/web/messages/admin.<lang>.json → `connections.<id>.…`).
// - Adding a provider = one entry here + its labels in both messages files.
import type { Kind, Mode } from './define';

export interface FieldDeclaration {
  /** For a secret: the vault name is `<provider>.<field>`. For config: the key in Integration.config. */
  field: string;
  /** Optional fields may be left empty. A secret is required unless it is marked optional (PR 620: the ERP's signing secret). */
  optional?: boolean;
}

export interface ConnectionDeclaration {
  /** Stable id, also the label key: `connections.<id>`. */
  id: string;
  kind: Kind;
  /** The adapter's provider key (the vault prefix of its secrets). */
  provider: string;
  /** Whether an adapter exists in code today. */
  adapter: boolean;
  /** Secret fields the owner types (stored in the vault, never shown again). */
  secrets: readonly FieldDeclaration[];
  /** Plain settings of the connection (account name, bucket …), stored on the Integration row. */
  config: readonly FieldDeclaration[];
  /** Only one connection of this kind may be switched on at a time (storage: media go to one place). */
  exclusive: boolean;
  /** The mode a passing test switches the connection to. */
  targetMode: Exclude<Mode, 'MOCK'>;
  /** Needs no key at all (runs from the server's own settings), e.g. local disk. */
  builtIn?: boolean;
  /**
   * PR 395: set up on its own admin page, never by typing its keys here (Google Drive: a one-click sign-in returns the
   * refresh token). Keys & connections shows its state with a link to that page and offers no form.
   */
  managedAt?: string;
}

export const connectionCatalogue: readonly ConnectionDeclaration[] = [
  {
    id: 'azureBlob',
    kind: 'STORAGE',
    provider: 'azureBlob',
    adapter: true,
    secrets: [{ field: 'accountKey' }],
    config: [{ field: 'accountName' }, { field: 'container' }, { field: 'endpoint', optional: true }],
    exclusive: true,
    targetMode: 'LIVE',
  },
  // S19 · PR 395 (CN-030) — Google Drive: the owner's own Google client (secret) and the refresh token of the one-click
  // sign-in, with the client id, the backup folder and the account. Set up on Settings → System → Backups only.
  {
    id: 'googleDrive',
    kind: 'GOOGLE_DRIVE',
    provider: 'googleDrive',
    adapter: true,
    secrets: [{ field: 'clientSecret' }, { field: 'refreshToken' }],
    config: [{ field: 'clientId' }, { field: 'folderId', optional: true }, { field: 'folderName', optional: true }, { field: 'account', optional: true }],
    exclusive: true,
    targetMode: 'LIVE',
    managedAt: '/admin/settings/system/backups',
  },
  { id: 'googleDriveAddOnly', kind: 'GOOGLE_DRIVE', provider: 'googleDriveAddOnly', adapter: false, secrets: [], config: [], exclusive: false, targetMode: 'LIVE' },
  // PR 602 — Cloudflare's cache purge: an API token with the zone's "Cache Purge" right, the zone id and the shop's host
  // names. The mock records the purges until the token's test passes.
  {
    id: 'cloudflare',
    kind: 'CDN',
    provider: 'cloudflare',
    adapter: true,
    secrets: [{ field: 'apiToken' }],
    config: [{ field: 'zoneId' }, { field: 'hosts' }],
    exclusive: true,
    targetMode: 'LIVE',
  },
  // S19 · PR 392 — Telegram alerts: the bot's token (from @BotFather) and the chat the alerts go to. The mock keeps them
  // in the process until the Test (the bot reads itself and the chat) passes; the server's own alerts use the same bot.
  {
    id: 'telegram',
    kind: 'TELEGRAM',
    provider: 'telegram',
    adapter: true,
    secrets: [{ field: 'botToken' }],
    config: [{ field: 'chatId' }, { field: 'baseUrl', optional: true }],
    exclusive: true,
    targetMode: 'LIVE',
  },
  // S19 · PR 397 — the Cloudflare Origin certificate and its private key (Cloudflare → SSL/TLS → Origin Server), so
  // Cloudflare's SSL/TLS mode can be "Full (strict)". The Test reads the pair itself (no network); until one passes the
  // server keeps its automatic certificate. Its own kind: it never stands in for the CDN connection above.
  {
    id: 'cloudflareOrigin',
    kind: 'CERTIFICATE',
    provider: 'cloudflareOrigin',
    adapter: true,
    secrets: [{ field: 'certificate' }, { field: 'privateKey' }],
    config: [],
    exclusive: true,
    targetMode: 'LIVE',
  },
  {
    id: 's3',
    kind: 'STORAGE',
    provider: 's3',
    adapter: true,
    secrets: [{ field: 'accessKeyId' }, { field: 'secretAccessKey' }],
    config: [{ field: 'bucket' }, { field: 'region' }, { field: 'endpoint', optional: true }],
    exclusive: true,
    targetMode: 'LIVE',
  },
  // PR 497, 498 (CN-005) — the shop's own ERP: its address, API key and webhook secret. Runs on the practice ERP
  // (MOCK) until these are entered and the Test button (`/health`) passes. One ERP connection is on at a time.
  // PR 620: a third, optional key, the signing secret of the ERP's own calls to the shop (empty = the webhook secret).
  {
    id: 'extasErp',
    kind: 'ERP',
    provider: 'extasErp',
    adapter: true,
    secrets: [{ field: 'apiKey' }, { field: 'webhookSecret' }, { field: 'signingSecret', optional: true }],
    config: [{ field: 'baseUrl' }],
    exclusive: true,
    targetMode: 'LIVE',
  },
  // PR 167 — bKash (tokenized checkout): the address bKash gives (sandbox or live) and its four keys. The practice
  // gateway serves until they are entered and the Test button passes; no customer is offered bKash online until the
  // owner switches the method on in the checkout's payment settings.
  {
    id: 'bkash',
    kind: 'PAYMENT',
    provider: 'bkash',
    adapter: true,
    secrets: [{ field: 'appKey' }, { field: 'appSecret' }, { field: 'username' }, { field: 'password' }],
    config: [{ field: 'baseUrl' }],
    exclusive: false,
    targetMode: 'LIVE',
  },
  // PR 168 — Nagad (merchant check-out): the address Nagad gives (sandbox or live), the merchant id and Nagad number,
  // and the two keys (the merchant's private key, Nagad's public key). The practice gateway serves until they are
  // entered and the Test button passes; no customer is offered Nagad online until the owner switches it on in checkout.
  {
    id: 'nagad',
    kind: 'PAYMENT',
    provider: 'nagad',
    adapter: true,
    secrets: [{ field: 'merchantPrivateKey' }, { field: 'nagadPublicKey' }],
    config: [{ field: 'baseUrl' }, { field: 'merchantId' }, { field: 'merchantNumber' }, { field: 'ipV4', optional: true }],
    exclusive: false,
    targetMode: 'LIVE',
  },
  // PR 169 — the card and bank gateway, SSLCommerz (hosted page): the address it gives (sandbox or live), the store id,
  // the shop's contact e-mail and the store password. It takes every card type and "Pay online"; the practice gateway
  // serves until they are entered and the Test passes, and no customer sees cards until the owner switches them on.
  {
    id: 'sslcommerz',
    kind: 'PAYMENT',
    provider: 'sslcommerz',
    adapter: true,
    secrets: [{ field: 'storePassword' }],
    config: [{ field: 'baseUrl' }, { field: 'storeId' }, { field: 'contactEmail' }],
    exclusive: false,
    targetMode: 'LIVE',
  },
  {
    id: 'localDisk',
    kind: 'STORAGE',
    provider: 'localDisk',
    adapter: true,
    secrets: [],
    config: [],
    exclusive: true,
    targetMode: 'LIVE',
    builtIn: true,
  },
  // PR 33 — reads a supplier's or brand's product page for "import from a link". No key: the owner names a page for
  // the Test button; until it passes, the import runs on the mock's sample page.
  {
    id: 'pageReader',
    kind: 'OTHER',
    provider: 'pageReader',
    adapter: true,
    secrets: [],
    config: [{ field: 'testUrl' }, { field: 'userAgent', optional: true }],
    exclusive: true,
    targetMode: 'LIVE',
  },
  // CN-020 (4) · PR 117 follow-up — speech to text for the checkout's voice address on phones without their own speech
  // engine: a Google Cloud API key restricted to Speech-to-Text. The mock hears nothing (the team listens) until the
  // key's test passes.
  {
    id: 'googleSpeech',
    kind: 'SPEECH',
    provider: 'googleSpeech',
    adapter: true,
    secrets: [{ field: 'apiKey' }],
    config: [{ field: 'lang', optional: true }],
    exclusive: false,
    targetMode: 'LIVE',
  },
  // PR 176 — Steadfast Courier: the API key and the secret key from its merchant panel. Runs on its practice world
  // (MOCK) until both are entered and the Test (the balance read) passes. Several couriers may be on at once.
  {
    id: 'steadfast',
    kind: 'COURIER',
    provider: 'steadfast',
    adapter: true,
    secrets: [{ field: 'apiKey' }, { field: 'secretKey' }],
    config: [{ field: 'baseUrl', optional: true }],
    exclusive: false,
    targetMode: 'LIVE',
  },
  // PR 177 — Pathao Courier: the merchant API's client id and secret and the merchant login (e-mail, password), with the
  // Pathao store the parcels go out from. Practice until the Test (a token) passes.
  {
    id: 'pathao',
    kind: 'COURIER',
    provider: 'pathao',
    adapter: true,
    secrets: [{ field: 'clientId' }, { field: 'clientSecret' }, { field: 'username' }, { field: 'password' }],
    config: [{ field: 'storeId' }, { field: 'baseUrl', optional: true }],
    exclusive: false,
    targetMode: 'LIVE',
  },
  // S14 · PR 291 — the SMS gateway (BulkSMSBD): the API key from its panel and the sender id it gave the account (its own
  // number, used until the shop's masking name is approved). The mock serves until the Test (the balance) passes; one
  // SMS gateway is on at a time.
  {
    id: 'bulkSmsBd',
    kind: 'SMS',
    provider: 'bulkSmsBd',
    adapter: true,
    secrets: [{ field: 'apiKey' }],
    config: [{ field: 'senderId' }, { field: 'baseUrl', optional: true }],
    exclusive: true,
    targetMode: 'LIVE',
  },
  // S14 · PR 292 — the WhatsApp Business Platform (Meta's Cloud API): the access token, the app secret (the webhook's
  // signature key) and the webhook's verify token, with the phone number id and the business account id. The mock serves
  // until the Test (reading the phone number) passes; one WhatsApp provider is on at a time.
  {
    id: 'whatsappCloud',
    kind: 'WHATSAPP',
    provider: 'whatsappCloud',
    adapter: true,
    secrets: [{ field: 'accessToken' }, { field: 'appSecret' }, { field: 'verifyToken' }],
    config: [{ field: 'phoneNumberId' }, { field: 'businessAccountId' }, { field: 'apiVersion', optional: true }, { field: 'baseUrl', optional: true }],
    exclusive: true,
    targetMode: 'LIVE',
  },
  // S22 · PR 426 — the Facebook Page's Messenger for the Support inbox: the Page access token, the app secret (the
  // webhook's signature key) and the webhook's verify token, with the Page id. The mock serves until the Test (reading
  // the Page) passes; one Page is on at a time.
  {
    id: 'messengerPage',
    kind: 'MESSENGER',
    provider: 'messengerPage',
    adapter: true,
    secrets: [{ field: 'pageAccessToken' }, { field: 'appSecret' }, { field: 'verifyToken' }],
    config: [{ field: 'pageId' }, { field: 'apiVersion', optional: true }, { field: 'baseUrl', optional: true }],
    exclusive: true,
    targetMode: 'LIVE',
  },
  // S11 · PR 233 — Google Search Console (a service account's JSON key; its e-mail added as a user of the property) and
  // Bing Webmaster Tools (the API key). The mock (no property, nothing sent) serves until the Test (listing the
  // properties) passes. Both may be on together: they are two engines, not two of one.
  {
    id: 'googleSearchConsole',
    kind: 'SEARCH_CONSOLE',
    provider: 'googleSearchConsole',
    adapter: true,
    secrets: [{ field: 'serviceAccountJson' }],
    config: [],
    exclusive: false,
    targetMode: 'LIVE',
  },
  {
    id: 'bingWebmaster',
    kind: 'SEARCH_CONSOLE',
    provider: 'bingWebmaster',
    adapter: true,
    secrets: [{ field: 'apiKey' }],
    config: [],
    exclusive: false,
    targetMode: 'LIVE',
  },
  // S13 · PR 257 — server-side event tracking (Marketing › Tracking): each ad platform's server API with its own key. The
  // mock serves until the Test passes (Meta: reading the pixel; Google: its checking address; TikTok: one test event).
  {
    id: 'metaConversions',
    kind: 'META',
    provider: 'metaConversions',
    adapter: true,
    secrets: [{ field: 'accessToken' }],
    config: [{ field: 'pixelId' }, { field: 'testEventCode', optional: true }, { field: 'apiVersion', optional: true }, { field: 'baseUrl', optional: true }],
    exclusive: false,
    targetMode: 'LIVE',
  },
  {
    id: 'googleAnalytics',
    kind: 'GOOGLE',
    provider: 'googleAnalytics',
    adapter: true,
    secrets: [{ field: 'apiSecret' }],
    config: [{ field: 'measurementId' }, { field: 'baseUrl', optional: true }],
    exclusive: false,
    targetMode: 'LIVE',
  },
  {
    id: 'tiktokEvents',
    kind: 'TIKTOK',
    provider: 'tiktokEvents',
    adapter: true,
    secrets: [{ field: 'accessToken' }],
    config: [{ field: 'pixelCode' }, { field: 'testEventCode', optional: true }, { field: 'baseUrl', optional: true }],
    exclusive: false,
    targetMode: 'LIVE',
  },
];

export function findConnection(id: string): ConnectionDeclaration | undefined {
  return connectionCatalogue.find((c) => c.id === id);
}
