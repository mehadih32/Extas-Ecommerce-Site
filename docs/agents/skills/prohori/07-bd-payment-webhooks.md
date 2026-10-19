# R07 · Bangladesh payment gateway callbacks and webhooks — bKash, Nagad, SSLCommerz

*Prohori প্রহরী · A360-02 · module 7 of 11 · level: Post-graduate → PhD · version 1.0 · as of October 2026*

Scope: general security principles from what the gateways publish. **Merchant credentials, exact field lists and IP
ranges come from each gateway's merchant documentation after onboarding — not from this file.** Payment changes are on
the owner's approval list.

---

## 1. What we could verify per gateway

### SSLCommerz [OFFICIAL — SSLCommerz developer docs (sandbox portal)]
- **IPN** (Instant Payment Notification): SSLCommerz sends an HTTP **POST** to the IPN listener set in the merchant panel; IPN reaches you **before** the customer returns; `ipn_url` is "important for catching pending/lost-session transactions".
- After receiving IPN you **must validate it with the Order Validation API** — "validate your transaction and amount".
- Order Validation API: GET with `val_id`, `store_id`, `store_passwd`; sandbox `https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php`, live `https://securepay.sslcommerz.com/validator/api/validationserverAPI.php`; response includes `status`, `tran_id`, `amount`, `bank_tran_id`.
- "After confirming the post keys are valid and untampered, validate your transaction's amount and status."
- The IPN listener should accept POSTs **only from SSLCommerz IP ranges or validate the `verify_sign` parameter**.
- Responses can carry a **risk flag: 0 = safe, 1 = risky** — fulfilment is the merchant's decision.
- Not verified this session: the exact `verify_sign`/`verify_key` hashing steps and status value list (the detailed hub pages didn't render) → read them in the merchant docs before coding.

### bKash (Tokenized Checkout) [COMMUNITY — third-party SDK README + API directory; official portal not readable by our tools]
- Flow named consistently in third-party docs: **grant token (and refresh) → create payment → customer approves in bKash → execute payment → query payment / search transaction → refund**; base host `tokenized.pay.bka.sh` (sandbox `tokenized.sandbox.bka.sh`).
- A third-party Rust SDK describes bKash webhooks as **AWS SNS-style signed messages** (fetch signing certificate, verify signature, confirm subscription) — **verify in bKash's official docs (developer.bka.sh) before relying on it**.
- bKash's WooCommerce plugin README says merchants **share a webhook URL with bKash** and can search transactions and refund from the merchant side.

### Nagad [COMMUNITY — community libraries only]
- Community libraries describe: merchant ID + RSA key pair, create payment → redirect → callback → **verify payment by payment reference ID**. One library explicitly says it is **not affiliated with Nagad**. No official public doc was readable → treat every detail as unverified until Nagad's merchant integration guide is in hand.

### If a gateway uses AWS SNS for webhooks [OFFICIAL — AWS SNS docs]
1. Accept only `SigningCertURL` over **https** on an **amazonaws.com SNS host**; reject anything else.
2. Build the string-to-sign from the fixed field list for the message `Type` (Notification vs SubscriptionConfirmation), each as `Name\nValue\n`.
3. `SignatureVersion` 1 = SHA1, 2 = SHA256.
4. Verify the Base64 signature with the certificate's public key; **reject on any mismatch**.
5. Reject old timestamps (replay window, e.g. 5 min — the AWS page marks this as recommended practice).

## 2. The EXTAS payment rules (all gateways) [HOUSE — built from the verified points above + OWASP A08/A10]

1. **Browser redirect ≠ payment.** The success page shows "checking payment…" until the server confirms.
2. **Server-to-server confirmation always:** SSLCommerz → Order Validation API; bKash → execute/query response from bKash's API; Nagad → verify API. A webhook alone is accepted only if its signature is verified **and** we still re-query when the amount is large or the flag is risky.
3. **Match three things:** amount (paisa-exact), currency (BDT), our order/transaction ID. Any mismatch → order goes to **review queue**, never "paid".
4. **Idempotency:** store gateway transaction ID with a unique constraint; a duplicate notification returns 200 and changes nothing.
5. **State machine:** `pending_payment → paid | failed | review`; transitions only inside a DB transaction; `paid` triggers stock commit and confirmation SMS once.
6. **Timeouts (A10):** if the query API times out, the order stays `pending_payment`; a job re-queries with backoff for up to N hours; never assume success.
7. **Webhook endpoint hygiene:** HTTPS only; POST only; IP allow-list where the gateway publishes ranges; body size limit; respond fast (queue the work); log raw payload **with secrets/PINs redacted**; alert on signature failures.
8. **Refunds** are on the approval list: agent proposes, owner taps approve, system calls the gateway refund API, records the gateway refund ID.
9. **Reconciliation daily:** our paid orders vs the gateway's settlement report — mismatches to Telegram (Gyani/finance).
10. **Credentials** in the vault (R05); sandbox and live keys never mixed (separate secret names + environment check at boot).

## 3. Decision tree — a callback arrives

```
POST /webhooks/<gateway>
├─ source allowed? (IP list or valid signature/verify_sign) ── no → 403, log, alert if repeated
├─ parse; find order by our tran_id ── not found → store as orphan, alert
├─ already processed (gateway txn id seen)? ── yes → 200, no change
├─ server-to-server validate/query ── fails/timeout → leave pending, schedule re-query
├─ amount == order total AND currency == BDT AND status success? ── no → review queue + alert
└─ yes → transaction: mark paid, commit stock, enqueue SMS → 200
```

## 4. Tests (Prohori R10 + sandbox)
- Replay the same IPN twice → one payment.
- Tamper amount in the IPN → review queue.
- Hit success URL without paying → still pending.
- Gateway query timeout (mock) → pending, re-query job scheduled.
- Webhook from a non-allowed IP / bad signature → 403 + alert.
- Sandbox keys in production env → app refuses to boot.

## 5. Worked example — "paid" orders with no money
Symptom: 3 bKash orders marked paid, not in settlement. Cause: code marked paid on the customer's redirect with `status=success` in the URL. Fix: rule 1–3; re-query all orders of the last 30 days against bKash's query/search API; correct statuses with owner approval; postmortem; regression test added.

---

**Sources** (type in brackets):
- [Official — SSLCommerz developer docs] Order Validation API: https://sandbox-gw.sslcommerz.com/doc/v4/order-validation.html
- [Official — SSLCommerz developer docs] IPN page: https://sandbox-gw.sslcommerz.com/doc/v4/ipn.html
- [Official — SSLCommerz developer docs] Docs hub (IPN, risk flag): https://sandbox-gw.sslcommerz.com/docs#order-validation-api
- [Third-party SDK] bkash-rs README (tokenized flow, SNS-style webhook helpers): https://docs.rs/crate/bkash-rs/latest/source/README.md
- [API directory] apis.io, bKash provider entry: https://apis.io/providers/bkash/
- [Plugin README] bKash for WooCommerce: https://cdn.jsdelivr.net/wp/bkash-for-woocommerce/trunk/README.md
- [Community library] nagad-payment-gateway README (not affiliated with Nagad): https://unpkg.com/nagad-payment-gateway@2.0.2/README.md
- [Official — AWS] Verifying Amazon SNS message signatures: https://docs.aws.amazon.com/es_es/sns/latest/dg/sns-verify-signature-of-message-verify-message-signature.html

**Could not read (permission/timeouts):** developer.bka.sh docs, bKash webhook AsyncAPI page, Nagad official docs.

*As of October 2026.*
