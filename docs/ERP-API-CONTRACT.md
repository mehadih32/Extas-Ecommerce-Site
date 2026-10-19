# EXTAS ERP ↔ E-commerce — API contract (CN-005, 20 Oct 2026)

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
