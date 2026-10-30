# EXTAS ERP ↔ E-commerce — API contract (CN-005, 20 Oct 2026)

> **25 Oct 2026 (CN-028):** the ERP now treats Retail as a separate buyer and has issued contract v6 (`docs/erp/site-changes-v6.md`). Where this file and v6 disagree, v6 wins: bills are made at shipment, returns go back as return lists, payments are never reported by the shop, and the shop sends a daily summary. The shop-side design is `docs/RETAIL-ERP-MODEL.md`; the adapter is PR 607–608, behind the setting `erp.model` (v5 stays until the switch-over, PR 619).

Both sides build against this file: the ERP project builds the endpoints, and the e-commerce project builds the
adapter (S09: PR 194–207, 497–499). Blueprint A3 is the rule book: the ERP is the master, the shop pushes business
documents and never journal lines, and the `companyId` comes from the key.

## Security
- **One integration = one store = one ERP company.** Each integration gets its own **API key**:
  - shown once, stored hashed, can be rotated and revoked;
  - sent as `Authorization: Bearer <key>`;
  - the `companyId` is taken from the key, **never from the request body**.
- **Webhook secret** per integration. Both directions sign the body: `X-Extas-Signature: sha256=<HMAC of raw body>`
  plus `X-Extas-Timestamp`. Requests older than 5 minutes are rejected.
- `Idempotency-Key` is required on every POST. A repeat returns the first result.
- Rate limit, an audit log of every call, and an optional IP allow-list (a setting).
- HTTPS only. Errors return JSON `{ "error": { "code", "message", "details" } }`.

## Base path `/api/v1/ecommerce`

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Key valid? Returns company name and integration name. |
| GET | `/catalog/variants?updatedSince=&cursor=&limit=` | Style → colour/size → variant: `sku`, `barcode`, `styleCode`, `styleName`, `color`, `size`, `retailPrice`, `avgCost`, `active`, `updatedAt`. Cursor paging. |
| GET | `/stock?updatedSince=&cursor=&warehouseId=` | Per SKU per warehouse: `onHand`, `reserved`, `available`, `updatedAt`. |
| GET | `/stock/{sku}` | Live stock for one SKU, used by the checkout's final check. |
| POST | `/orders` | Creates a `SalesOrder`: channel `WEBSITE`, status `CONFIRMED`, `externalOrderId` (unique per integration), customer name/phone, shipping address, items by `sku` (qty, unit price, discount), shipping fee, COD amount, payment method, note. The ERP reserves stock with its own `StockBalance.reserved` logic. Returns `erpOrderId`. If stock is short it returns `409` with the SKUs that are short. |
| PATCH | `/orders/{externalOrderId}` | Status change: `PROCESSING`, `PACKED`, `CANCELLED` (releases the reservation), `DELIVERED`, `RETURNED`. Also edits items before packing. |
| POST | `/payments` | `externalOrderId`, amount, method (COD / bKash / Nagad / card), reference, date. The ERP posts the journals itself. |
| POST | `/shipments` | `externalOrderId`, courier (Steadfast / Pathao / RedX / …), consignment ID, charge. |
| POST | `/shipments/{consignmentId}/events` | Status events with time (picked, in transit, delivered, returned, …). |
| POST | `/returns` | `externalOrderId`, items, reason, QC result per item (good / B-grade / damaged). |
| POST | `/ad-spend` | Daily total per platform: date, platform, amount, campaign (optional). Maps to `AdSpend`. |

## ERP → shop webhooks (to the shop URL saved in the integration)
- `variant.changed`: price, active flag, new variant.
- `stock.changed`: SKU, warehouse, `onHand`, `reserved`, `available`.
- Signed as above. Retried with backoff up to 24 h. Every event is logged in `WebhookEvent`.
- **Fallback:** the shop polls `updatedSince` every few minutes, so a missed webhook never leaves stock wrong.

### The shop's receiver (PR 196, built 23 Oct 2026)
- **URL:** `POST https://<shop domain>/api/erp/webhook` (the domain is a setting; on staging, new.extas.com.bd).
  On staging this one request (POST, this exact path) passes the preview password without it, since the ERP has no
  browser; every other page and method there still asks for the password (follow-up 80, `infra/stack/caddy/auth-block.sh`).
- **Body** (JSON, at most `erp.webhook.maxBodyKb`, default 64 KB; read only up to that, with or without Content-Length):
  `{ "id": "<event id, unique per integration>", "type": "stock.changed" | "variant.changed", "occurredAt": "<ISO time>", "data": { … } }`.
  - `stock.changed` data is one row as `GET /stock` returns it: `sku`, `warehouseId`, `onHand`, `reserved`,
    `available`, `updatedAt`.
  - `variant.changed` data is one row as `GET /catalog/variants` returns it.
  - With no `id` in the body, the `Idempotency-Key` header is the event id (v5 only: a v6 event's `eventId` must be in
    the signed body; `X-Extas-Delivery` may only repeat it).
  - The event id is unique per integration: the same id from two stores' own connections is two events.
- **Headers:** `X-Extas-Signature: sha256=<hex HMAC-SHA256 of the raw body with the webhook secret>` and
  `X-Extas-Timestamp: <unix seconds>`. Older than `erp.webhook.maxAgeSeconds` (default 300) is refused as a replay.
- **The secret** is the integration's webhook secret, typed into the shop's vault on "Keys & connections"
  (`extasErp.webhookSecret`). **While no secret is entered, the shop refuses every webhook.**
- **Answers** (JSON `{ ok, code, eventId? }`):

  | Status | Code | Meaning | ERP should |
  |---|---|---|---|
  | 202 | `ACCEPTED` | Verified and stored; the shop applies it in the background. | stop retrying |
  | 202 | `IGNORED_TYPE` | Verified, but a type the shop does not use; logged. | stop retrying |
  | 200 | `DUPLICATE` | The same event id within `erp.webhook.dedupeHours` (default 72 h); stored once. | stop retrying |
  | 400 | `BAD_JSON` / `BAD_PAYLOAD` / `NO_EVENT_ID` | Verified but broken; logged as failed where it has an id. | fix, do not retry the same body |
  | 401 | ~~`NO_SECRET` / `UNSIGNED` / `BAD_SIGNATURE` / `STALE`~~ `UNAUTHORIZED` (30 Oct, p3 review: one code for every reason; the reason is counted on the shop only) | Not accepted; nothing stored. A request with no or a malformed signature is refused before the shop reads anything. A secret two stores share is refused for every event type. | check the secret and clock |
  | 429 | `RATE_LIMITED` | Too many refused requests this minute from this address (`erp.siteApi.refusedPerMinute`); ~~a request signed with the store's own secret is never refused this way.~~ (30 Oct, p3 review round 2:) a request signed with a secret the shop already holds is let through. Right after a secret changes, the shop learns the new one within `system.integrationKeyCacheSeconds` (default 60 s): while an address is cut off, one of its requests per that period still reaches the secret check. The address is the one the shop's proxy sees (Cloudflare's `CF-Connecting-IP` is believed only from Cloudflare's ranges); IPv6 is counted per /64. (Round 3:) an address whose request verified lately keeps a count of its own however many other addresses send. | retry later |
  | 413 | `TOO_LARGE` | Over the size limit. | send one row per event |
  | 503 | `OFF` / `UNAVAILABLE` | The receiver is switched off (`erp.webhook.enabled`) or starting. | retry later |

- **The ERP's calls to the shop** (`GET /erp-api/top-products`, `GET /erp-api/customers`, PR 620) are refused the same
  way: ~~a 401 names its reason (`NO_SECRET` / `UNSIGNED` / `BAD_SIGNATURE` / `STALE` / `SHARED_SECRET`)~~ every 401 is
  `UNAUTHORIZED` (30 Oct, p3 review round 2), so a caller cannot learn whether a store has a secret; the reason is
  counted on the shop only (shown on the "ERP asks the shop" card). 429 `RATE_LIMITED` works as in the table above.
- **Order:** a change older than what the shop already holds for that SKU (by `updatedAt`) is ignored as out of
  order, so a late "5" never overwrites a newer "3". The same row by webhook and again by the poll moves stock once.
- **What it changes:** `stock.changed` updates the shop's stock copy (with a stock movement). `variant.changed`
  updates the ERP mirror of the variant (barcode, ERP retail price, average cost); the shop's own sale price is never
  changed by the ERP.
- **The practice ERP** (the mock used until the real one is connected) can make signed test events
  (`stockChangedWebhook`, `variantChangedWebhook`); they reach the shop's stock only when `erp.mock.stockEnabled` is on.

## ERP admin screen
Settings → Integrations → **E-commerce**:
- create an integration (platform `CUSTOM_WEBSITE`, name, company, warehouse, shop webhook URL);
- **Generate key** (shown once), rotate, revoke;
- last sync time, webhook log, test button.

Uses the existing `SalesChannelIntegration` and `WebhookEvent` models. Secrets are encrypted (`apiKeyRef`, `webhookSecretRef`).

## Rules
- Nothing existing in the ERP may break. Tests cover every endpoint, including the auth failure, idempotency, 409
  short-stock and webhook signature paths.
- The ERP commits an `openapi.yaml` for this API.
- The shop runs on a mock of this API (A1.3) until the owner enters the ERP address, key and secret in the shop's
  "Keys & connections" page.
