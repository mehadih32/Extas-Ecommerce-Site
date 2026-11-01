# Final analysis before go-live — the customer 360° (November 2026)

PR 414 follow-up · CN-013 go-live gate, phase 2 · owner, 1 Nov 2026.
The run itself is `.github/workflows/gate-c360.yml` → `infra/deploy/gate-c360.sh` → `tools/gate-c360/run.mjs`; its newest
report is [`docs/reports/gate-c360/latest/README.md`](../reports/gate-c360/latest/README.md). The device, network,
basket, address and cancel matrix of test orders is the separate gate-orders run; this file only points to it.

## মালিকের জন্য সংক্ষেপে

- একজন টেস্ট কাস্টমার ("GATE TEST …", প্রতিবার নতুন নম্বর) পুরো পথটা হাঁটে: অ্যাড লিংক থেকে আসা, খোঁজা, পণ্য দেখা, ব্যাগ,
  অর্ডার, কোড দিয়ে লগইন, অ্যাকাউন্টের সব অপশন, সাপোর্ট, আর অর্ডারের পরের মেসেজ। মাঝারি অ্যান্ড্রয়েড, আইফোন আর ডেস্কটপে,
  ইংরেজি আর বাংলায়।
- এটা শুধু new.extas.com.bd-তে চলে, সব কিছু প্র্যাকটিস মোডে (আসল SMS, কুরিয়ার বা পেমেন্ট না)। শেষে টেস্ট অর্ডার বাতিল
  আর আর্কাইভ হয়, কিছু মুছে ফেলা হয় না।
- লোকাল টেস্টে যা ঠিকমতো চলেছে: অর্ডার, কোড দিয়ে লগইন, গেস্ট অর্ডার অ্যাকাউন্টে দেখা যাওয়া, ইনভয়েস, নোটিফিকেশন
  সেটিং, অ্যাডমিনে যেকোনো ফরম্যাটের নম্বর দিয়ে কাস্টমার খুঁজে পাওয়া।
- যা এখনো নেই (লঞ্চের আগে বানানো দরকার): অ্যাডের হিসাব (কোন অ্যাড থেকে অর্ডার এল সেটা রাখা হয় না), অ্যাকাউন্ট থেকে
  অর্ডার বাতিলের বাটন, "আবার অর্ডার করুন", ডিফল্ট ঠিকানা, ফোন নম্বর বদলানো, নিজের তথ্য চাওয়া বা মুছতে বলা,
  Messenger বাটন, যোগাযোগের ফর্ম।
- আপনার কিছু করার নেই। এগুলো নিচের তালিকায় ফাইল আর লাইনসহ লেখা আছে, বিল্ডাররা ঠিক করবে।

## How a run works

| Part | What it does |
|---|---|
| `gate-c360.yml` | By hand only (`workflow_dispatch`, input `scenarios`: all, or before, order, account, support, after), its own concurrency group `extas-gate-c360`, on `[self-hosted, extas-vm]`. Commits the report with `[skip ci]`. |
| `infra/deploy/gate-c360.sh` | Refuses (exit 2) unless the host is `EXTAS_STAGING_HOST` of server.conf and the main domain is not open; refuses unless every customer-facing integration is on its mock (`helper.ts guard`). Picks a fresh "GATE TEST" number that no customer owns, prepares the check account, runs the browser and answers its helper requests through a file bridge. Cleans up twice (in the run and after it). |
| `tools/gate-c360/helper.ts` | The database side, run in the migrate image: the mock-provider guard, the gate customer, a known OTP code for the gate's own challenge, moving the order on with the order service, the facts the admin should show, the planned messages re-rendered, the clean-up (cancel, archive, expire; never delete). It touches only rows whose name starts with "GATE TEST". |
| `tools/gate-c360/run.mjs` | The browser walk; every step is PASS, FAIL or SKIP with a reason, a load time, and the problems seen (console errors, failed requests, dead links, unnamed buttons, untranslated text on /bn, phone layout). |
| `tools/gate-c360/lib.mjs` | The pure parts (phone forms, host guard, redaction, untranslated text, message checks, the report), unit-tested in `lib.test.mjs`. |

Secrets: the check account's password lives only on the server; the report runs through `redact()` (phone digits,
codes, tokens, cookies and keys are masked), and the helper strips URLs from its errors.

## The life cycle, stage by stage

| Stage | Steps (ids in the report) | Automatic in the gate | Needs a person | Needs a real key |
|---|---|---|---|---|
| Arrives from an ad | `before/landing-ad` | UTM + fbclid link opens, tags kept? | — | Meta pixel/CAPI to see the ad side |
| Facebook / Messenger in-app browser | `before/facebook-in-app`, `before/messenger-in-app` | FB4A UA on Android, Messenger UA on iPhone; page, bag button | — | — |
| Search (English, Bengali, misspelt, Banglish) | `before/search-*` | yes | — | — |
| Category and filter | `before/category-filter` | yes (phone sheet, desktop aside) | — | — |
| Product page, size guide | `before/product-page` | opens, closes on Escape | — | — |
| Sold-out size, back-in-stock | `before/back-in-stock` | yes, when `pdp.size.notifyBack` is on (SKIP otherwise) | — | SMS key for the real notice |
| Wishlist, bag | `before/wishlist`, `before/bag` | yes | — | — |
| Abandoned checkout and recovery | `before/abandoned-checkout` | draft saved? (SKIP while the draft switch is off) | — | SMS/WhatsApp for the real reminder |
| Leaves and comes back | `before/leaves-and-returns` | bag kept after a new visit | — | — |
| Guest order | `order/guest-order`, `order/thanks-page` | COD when offered, else the practice gateway | — | payment gateway key for real money |
| OTP sign-in | `order/otp-sign-in` | the mock code, set by the helper | — | SMS key |
| Guest order in his account | `order/guest-order-in-account` | yes | — | — |
| Account pages | `account/page-*` on every screen × language | yes | — | — |
| Status, tracking | `account/order-status`, `account/tracking-after-delivery` | status; tracking only after a courier has the parcel | staff books the parcel | courier key |
| Invoice | `account/invoice-download` | yes | — | — |
| Cancel | `account/cancel-window` | yes | — | — |
| Delivered on the mocks | `account/deliver-on-mocks` | confirm and pack by the order service | **booking the parcel is a staff action** (SKIP "needs a person") | courier key |
| Review, exchange | `account/review`, `account/exchange` | after delivery only; the exchange is opened, never sent | as above | — |
| Reorder, addresses, profile, consent, privacy, sign out and in | `account/*` | yes | — | — |
| Support channels | `support/live-chat`, `whatsapp-button`, `messenger-button`, `contact-form` | yes (SKIP when the owner keeps a channel off) | — | WhatsApp/Messenger keys for real chats |
| Staff finds him | `support/find-by-phone` (01…, +880…, 880…, spaced, Bengali digits), `inbox-search-by-phone`, `customer-page` | yes, with the check account | — | — |
| Staff traces his orders, context panel, product card | `support/trace-orders`, `context-panel`, `product-card` | yes where built | — | — |
| Confirmation messages | `after/messages-planned`, `message-sms`, `message-whatsapp`, `message-email` | right order number, amount, language; no money ask on a prepaid order | — | SMS/WhatsApp/email keys to see them arrive |
| Admin side | `after/admin-sees-order`, `attribution`, `delivered-is-sale`, `history` | yes | delivered needs the booking above | — |
| Clean-up | `cleanup` | cancel, archive, expire codes; nothing deleted | — | — |

## Angles the owner did not list

| Angle | State | Where |
|---|---|---|
| Facebook / Messenger in-app browser | covered | `before/facebook-in-app`, `before/messenger-in-app` |
| Bengali digits (phone, search) | covered on the customer list; **not covered** in the support inbox search | `support/find-by-phone`; `packages/support/src/inbox.ts:85` |
| COD refusals (parcel returned unpaid) | not covered | needs the courier return flow and a real courier key; the cancel matrix is gate-orders |
| Fake orders and fraud | needs key | fraud check is an integration (`FRAUD_CHECK`); the gate only proves it is on the mock |
| OTP not arriving (resend, wait, fallback) | partly covered | sign-in on the mock; resend timing and a WhatsApp fallback need the real SMS key |
| Slow 2G/3G | covered by gate-orders (network matrix) | not repeated here |
| Low-end phones | covered | the mid Android screen and UA here; the low-end devices in gate-orders |
| Eid rush (many orders at once) | not covered | a load test with test orders is a separate job; stock and courier cut-offs need a person |
| Size exchange | partly covered | the exchange screen after delivery; delivery needs staff booking |
| Partial delivery | not covered | needs a person and a courier |
| Courier delay | needs key | tracking events come from the courier |
| Missed call-back | not covered | no call-back request or follow-up task on the shop yet |
| Repeat customers | partly covered | sign-in shows his old order; **no reorder** |
| Privacy and erasure | **not covered on the shop** | only staff have the requests screen |
| Accessibility | partly covered | unnamed buttons and dead links listed per page; a full screen-reader pass is not automatic |
| Ad attribution (UTM, fbclid) | covered, fails | see finding 1 |
| Untranslated English on /bn | covered | every /bn step |

## Findings from the local run (sample data, 1 Nov 2026)

Run against a local production build with the sample data, every provider on its mock. These are real gaps in the
app; the gate reports them as FAIL. App code was not changed in this PR.

| # | Step | What fails | Where | Prevention | Beyond the ask |
|---|---|---|---|---|---|
| 1 | `before/landing-ad`, `after/attribution` | UTM tags and fbclid are dropped; the order stores no source, campaign or platform, so ad sales cannot be counted | `apps/web/src/lib/tracking/model.ts:72` only reads `_fbc`; `Order.utmSource/utmCampaign/adPlatform` are never written (read in `packages/orders/src/export.ts:59`) | the gate step; a unit test on the checkout that a tagged visit writes the order's source | first-touch and last-touch both kept, so the ROAS report can show either |
| 2 | `account/cancel-window` | the cancel window says he may cancel, but the order page has no cancel button | `apps/web/src/lib/shop/account-api.ts:11`, `:155` (API exists); `apps/web/src/components/shop/account/OrderPage.tsx` | the gate step | ask the reason in one tap; offer a size change before a cancel |
| 3 | `account/reorder` | no "order again" on a past order | `apps/web/src/components/shop/account/OrderPage.tsx` | the gate step | reorder with the size he kept, out-of-stock sizes shown honestly |
| 4 | `account/addresses` | add and edit work, but no default address can be chosen | `apps/web/src/components/shop/account/ProfileForms.tsx:92` | the gate step | the checkout picks the default and the last-used one |
| 5 | `account/profile` | the phone is read-only; no verified change | `apps/web/src/components/shop/account/ProfileForms.tsx:87` | the gate step | change with an OTP to the new number, old orders kept |
| 6 | `account/privacy-request` | he cannot ask for his data or its erasure; only staff have the screen | `apps/web/src/components/admin/settings/PrivacyRequests.tsx` (staff side only) | the gate step | a request button that files into the staff screen |
| 7 | `support/messenger-button` | no Messenger link on the shop, though most orders come from Facebook | shop shell (the inbox can take Messenger, PR 426) | the gate step | a switch with the page link from settings, off by default |
| 8 | `support/contact-form` | the contact page lists ways to reach the shop but has no form, so nothing lands in the support inbox | `/help/contact` page | the gate step | the form files a conversation with his order attached |
| 9 | `support/inbox-search-by-phone` | a number typed in Bengali digits is never searched as a number | `packages/support/src/inbox.ts:85` (`\D` strips non-ASCII digits) | the gate step once a conversation exists; a unit test | one shared phone normaliser for every search box |
| 10 | `support/context-panel`, `support/product-card`, journey view | not built yet | PR 428, S22, PR 288 | SKIP until built | — |

What passed locally: the guest order (prepaid on the practice gateway, since the sample shop offers no COD), the
thank-you page, OTP sign-in on the mock, the guest order shown in his account, the order status, the invoice
download, consent and notifications, sign out and in, the admin seeing the order at once, and staff finding him by
his number in every format on the customer list.

Skipped locally: live chat and the WhatsApp button (off as shipped), the abandoned-checkout draft (off), the
back-in-stock signup (off), and every step after delivery (booking the parcel is a staff action). The confirmation
messages need the jobs worker, which does not run in a local build; on the preview they are checked for real.

## What needs a person or a real key

- **A person:** booking the parcel (Packing › Hand-over), so the order can reach delivered and the review, exchange,
  tracking and "delivered is a sale" steps can run; a partial delivery; a COD refusal; the Eid-rush rehearsal.
- **A real key (owner types it in Keys & connections):** SMS (OTP arriving, resend), WhatsApp and Messenger (real
  chats and messages), email, the courier (tracking, delays, returns), the payment gateway (real money), the fraud
  check, Meta CAPI (the ad side of attribution). Until then the gate refuses to run against any of them.

## Live results

To be filled in by the integrator after each run on new.extas.com.bd.

### Run 1

- Date, live version (commit):
- Result (pass / fail / skip counts):
- Failed steps and the fix PR for each:

### Run 2

- Date, live version (commit):
- Result (pass / fail / skip counts):
- Failed steps and the fix PR for each:
