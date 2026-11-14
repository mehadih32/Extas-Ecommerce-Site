# PARKED — everything that is closed, parked or switched off (14 Nov 2026, CN-051)

**The project has no open work.** What is listed here stays as it is until the owner says so. A new problem comes to
the chat first and is discussed there. Claude shows the owner this list when he asks "what is parked?".

> **বাংলায়:** এই পাতায় সব বন্ধ, তোলা আর বন্ধ-সুইচের জিনিস এক জায়গায়। কিছুই নিজে থেকে চালু হবে না। আপনি বললে তবেই শুরু।
> প্রতিটার পাশে লেখা আছে শুরু করতে কী লাগবে।

Where things are written: the register [`docs/MASTER-REGISTER.md`](../MASTER-REGISTER.md) (PR rows), the stage pages
[`docs/stages/`](../stages/README.md), the questions that were asked in [`BLOCKED.md`](../../BLOCKED.md).

## 1. Closed or parked stages and PRs

| What | Plain line | What it would take to start |
|---|---|---|
| **S17 Multi-store** (PR 356–377, 511–512; 24 PRs) | The shop is built for one store, extas.com.bd. 1 PR is built and kept (PR 362, the Cloudflare cache rule and host names); **23 PRs are closed**, not built. S17 stays switched off (`stages.closedShown`). | The owner says "open S17". Then `stages.closedShown` for S17 is switched on and the 23 PRs are built in register order, same gates as the rest. |
| **S26 Installation, documentation and distribution** (PR 513–518; 6 PRs) | The handover pack for giving the shop to another business. Parked. | The owner says "build S26". Needs S17 first for anything that needs a second store. |
| **S27 No-ERP stock module** (unnumbered) | A stock module for a shop with no ERP. Has no PR numbers yet. | The owner approves it, the next free PR numbers are filed in the register, then it is built. |
| **Admin look ক Clear Day** (PR 649) | A second Lumen look. Parked. The look the owner selected stays. | The owner says "build ক"; the look lives on the theme layer of PR 625 and shows in Settings › Admin look (PR 630). Mock-up: `docs/demo/admin-look/ADMIN-LOOKS-V1.html`. |
| **Admin look খ Night Atelier** (PR 650) | A third Lumen look. Parked. | The owner says "build খ". Same place as above. |
| **Admin look গ Studio** (PR 651) | A fourth Lumen look. Parked. | The owner says "build গ". Same place as above. |

S15 (AI 360), S23 (social studio), S24 (photoshoot) and S25 (video studio) were closed on 6 Nov and **finished
afterwards** (reopened by CN-039, all built). Their screens are switched on live with `stages.closedShown`; the AI
itself stays off (`ai.enabled`) until the owner turns it on.

## 2. Asked for in the prototype, never built (no register row)

Agent C checked the menu on 14 Nov: all 25 pages are in the menu and nothing is waiting in `nav-pending.json`. These
8 prototype tabs have **no register PR**. They are not built and would be **new features**.

| Prototype tab | Plain line | What it would take to start |
|---|---|---|
| Couriers › Claims & payouts | One tab for courier claims and payouts together (claims and payouts exist on their own pages). | The owner asks; file a new PR number in the register; then build. |
| Products › Sets | A tab for sets and combos inside Products (combos exist under Combos). | Same. |
| Website › Policies | Policy texts as a Website tab (they are under Settings › Policies & texts). | Same. |
| Reports › Profit | A profit report tab. | Same. |
| Reports › Products | A products report tab. | Same. |
| Reports › Marketing & ads | A marketing and ads report tab (Marketing › Overview exists). | Same. |
| Reports › Monthly review | A monthly review tab (the Report packs have a Monthly business pack). | Same. |
| AI Center › Training | A training tab for the AI (skills, sandbox and learning pages exist). | Same. |

## 3. Left open with a reason

| What | Plain line | What it would take |
|---|---|---|
| **PR 587 old-address redirects** | The main domain was switched on 11 Nov and holds. On 14 Nov the 45 old WordPress addresses answered 404 on the live site (the map is off). | The coordinator switches `seo.redirects.wordpressMapLive` on and the 45 addresses are checked for 301; then PR 587 is marked done. |
| **PR 646 AI Center in Lumen** | Superseded by S15 and the menu section; not built as filed. Only a cosmetic leftover: the Approvals, Models, Cost book, Diary, Permissions and Skills pages do not use the Lumen page-header classes (`lm-ph`). | The owner asks for the look to be matched; a small styling change, file it as a new PR. |
| **About 209 open follow-up rows** in `PROGRESS.md`, and the notes in [`docs/after-golive-notes.md`](../after-golive-notes.md) | Small "better later" items. All "can wait", none touches orders or money. | The owner picks any of them in the chat. |

## 4. Built, but switched off until the owner says

| What | Plain line | What it would take to start |
|---|---|---|
| **AI** (`ai.enabled`) | Every AI agent is built and off. Nothing is sent to a buyer or supplier by AI, ever. | The owner turns it on in Settings. |
| **Start fresh** (BLOCKED 33; PR 706) | The one-time go-live clear of test entries. | The owner's written OK, then PIN, the typed words and a recent backup. |
| **Cash in and out, staff discount limits, refund approver, affiliate payouts** (687, 702, 688, 695) | Money actions that ship off. | The owner's written OK per switch. |
| **Offers, auto-confirm, courier score, "possible match", merge orders, replacement path, peak mode** (676–679, 662, 663, 668, 665, 669) | Built with every switch off and every number empty. | The owner picks which to switch on and the numbers (BLOCKED wave 1 and 3 notes). |
| **Questions with a safe default** (BLOCKED 13, 14, 15, 17–22, 26, 27, 28) | Each has a default that already runs; nothing waits on them. | The owner answers in the chat. |
| **CI plan and batch ruleset** (BLOCKED 31, 32) | A paid second runner or a bigger GitHub plan; a GitHub rule for `batch-*` branches. | The owner decides; only he can change GitHub settings. |

## 5. The owner's own steps (nothing waits for them)

| What | Plain line |
|---|---|
| Store details and delivery charges (BLOCKED 24) | Phone, address, registered name, trade licence, delivery charges. Typed in the admin. An empty field never shows on the shop. |
| Copy of backups off the server (BLOCKED 23) | Azure Blob and Google Drive (the 11 Nov go-live check showed these not ready). The server's own nightly backup runs meanwhile. |
| Live keys (payment, courier, SMS) and Telegram | Typed in Keys & connections when he has them. Everything runs on a mock until then. |
| A test COD order and the Cloudflare key (BLOCKED 29) | Click-only steps the owner does himself. |
| His own two-step sign-in | One staff member's own 2FA. |
| Delete the Cloudflare `new` record | After the retire-staging change is live (one domain, extas.com.bd). |
| Sign in at https://extas.com.bd/access | The owner's login address from 14 Nov (CN-051); `/admin/login` no longer exists. |

## How to resume

Say in the chat which item you want and Claude starts there: file it in the register first (a dated update on its
row, or the next free PR number and a change note), then build it with the same gates as before. Nothing else starts by
itself.
