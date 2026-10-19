# B04 · ERP sync patterns (shop ⇄ EXTAS ERP)

*Bhandari ভান্ডারী · A360-03 · module 4 of 8 · level: Post-graduate · version 1.0 · as of October 2026*

The sync map, ownership split and three adapter rules are **already decided** in the blueprint (A3.3–A3.5). This
module is how to make them reliable.

---

## 1. Decided rules (recap) [HOUSE — blueprint]

| What | Direction | ERP model |
|---|---|---|
| Variants: SKU, colour, size, retail price, cost | ERP → shop | `ProductVariant` |
| Stock on hand and reserved | ERP → shop | `StockBalance` |
| Confirmed order | shop → ERP | `SalesOrder` + items, channel `WEBSITE` |
| Payment received | shop → ERP | `Payment` |
| Shipment booked + status | shop → ERP | `Shipment` + `ShipmentEvent` |
| Return + QC result | shop → ERP | `SalesReturn` + items |
| Daily ad spend per platform | shop → ERP | `AdSpend` |

1. **Push business documents, never journal lines** — the ERP's double entry makes the journals.
2. **Cart holds stay local**; ERP `reserved` starts at confirmed order (B03).
3. **Every call carries `companyId`** (multi-company ERP).
Plus: the ERP already has `SalesChannelIntegration` (apiKeyRef, webhookSecretRef, lastSyncedAt) and a `WebhookEvent` inbox (source, payload, status) — use them. And "ERP optional" (profile S09): the shop must run with its own mirror if the ERP is down or absent.

## 2. Pattern: transactional outbox + idempotent consumer [OFFICIAL — microservices.io pattern]

Problem: "save the order **and** tell the ERP" can't be atomic across two systems; sending mid-transaction or after commit can leave them out of sync.
Solution: in the **same DB transaction** that saves the order, write a row to an **`outbox`** table; a relay process reads the outbox and sends to the ERP. Messages go only if the transaction committed, in order.
Consequence: the relay can send a message **more than once** → the **consumer must be idempotent** (track processed message IDs).

### EXTAS implementation [HOUSE]
```
shop DB transaction:  INSERT order ... ; INSERT outbox(id=uuid, type='SalesOrder.created', company_id, payload, status='new')
relay (every 5 s):    pick 'new' rows in order → POST to ERP with header Idempotency-Key: <outbox.id>
                      2xx → status='sent' ; 4xx (validation) → 'failed' + Telegram to Bhandari ; 5xx/timeout → retry with backoff (1m, 5m, 15m, 1h …)
ERP side:             WebhookEvent stores Idempotency-Key; same key again → return the first result, change nothing
ERP → shop:           ERP sends stock/variant events to the shop's inbox (signed, R07 hygiene); shop applies idempotently by event id + version
```
- **Ordering:** per-entity sequence numbers (variant stock version); the shop ignores an event older than what it has (prevents a late "stock 5" overwriting a newer "stock 3").
- **Nightly full reconcile:** compare all variants' stock and prices ERP vs mirror; fix the mirror from the ERP (ERP is the source of truth for stock/price/cost); report counts to Telegram.
- **Dead letters:** messages failing > 24 h go to a review screen; nothing is silently dropped.
- **Secrets:** API keys referenced via `apiKeyRef` and resolved from the vault (Prohori R05).

## 3. What happens when the ERP is down [HOUSE]
- Shop keeps selling from the mirror with the safety buffer (B03); orders queue in the outbox.
- Stock events stop → after 30 min Prohori's dead-man monitor alerts (R08); campaign-hour policy: if ERP down > 2 h, Bhandari may raise safety buffers on fast movers (no owner approval needed — it reduces selling, not prices).
- When the ERP returns, the relay drains the queue in order; the nightly reconcile catches anything else.

## 4. Mapping table (keep it in the adapter, versioned)
| Shop field | ERP field | Note |
|---|---|---|
| order.number | SalesOrder.externalOrderId | human-friendly; not an access key (R06) |
| customer phone (ASCII 01…) | customerPhone | normalised (Shilpi U09) |
| delivery band | shippingAddress + band code | DHAKA_CITY / SUB_AREA / REST_OF_BD |
| COD amount | Payment (on delivery) | posted when courier settles, not at order (B05) |
| exchange | SalesReturn + new SalesOrder | per the four-tier exchange engine (B06) |

## 5. Checklist
- [ ] Outbox written in the same transaction as every synced business event
- [ ] Idempotency-Key on every shop → ERP call; ERP dedupes
- [ ] Inbound ERP events verified (signature/secret) and versioned
- [ ] companyId on every call
- [ ] Nightly reconcile + drift report; dead-letter screen empty or explained
- [ ] ERP-down drill done (shop keeps selling, queue drains)

## 6. Worked example — duplicate SalesOrders in the ERP
Symptom: 14 orders appear twice in the ERP after a network blip. Cause: relay retried after timeouts; ERP had no idempotency check. Fix: Idempotency-Key header + unique constraint on `WebhookEvent` key; script merges the duplicates (owner approves because accounting entries exist); regression test: send the same message 3 times → 1 SalesOrder.

---

**Sources** (type in brackets):
- [Official — pattern reference] microservices.io, Pattern: Transactional outbox: https://microservices.io/patterns/data/transactional-outbox
- [Internal] blueprint A3.2–A3.6 (ERP models, sync map, three rules), bhandari.md (ERP optional), skills/prohori/05 and 08

*As of October 2026.*
