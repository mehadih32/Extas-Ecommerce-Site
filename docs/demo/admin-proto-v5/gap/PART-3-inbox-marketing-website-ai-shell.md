# Gap map, part 3: Inbox, Marketing, Website, AI Center, Shell, cross-cutting rules

Prototype v5 against the real repo, by Phase A of `BUILD-PROMPT.md` (blueprint and code first; nothing built is rebuilt).
Verdicts: **M** = BUILT-MATCHES (build nothing), **D** = BUILT-DIFFERS (small delta on the same PR), **N** = NEW (exists nowhere).
Sizes S / M / L. Read-only analysis; evidence = real path, register PR numbers, blueprint section. Register highest PR at writing: 658.
"Mock" = the integration runs on its mock until the owner types the key (A1.3).

**Counts: 23 M, 30 D, 13 N = 66 items. 15 proposed new PRs, 22 delta follow-ups.**

## 0. Facts that shape everything below

1. **The real admin already wears Lumen** (CN-036, PR 625-648, all merged). The prototype's `app.css` calls itself "Lumen look" but is a flatter relative of it (section 5, item S8). Phase B must not redraw the look; it re-arranges menu and pages.
2. Real sections live in `apps/web/src/lib/admin-shell/sections.ts` (menu = `lumen-nav.ts`, groups Daily / Grow / Business / System). Labels are in `apps/web/messages/admin-shell.{en,bn}.json`, so renames are label changes, and routes (`/admin/money`, `/admin/support` ...) stay as they are (no redirects needed).
3. S15 / S24 / S25 are frozen (CN-047). Their built pages are hidden by PR 652's switch (`stages.closedShown`, `lib/stages/closed.ts`), off as shipped. The AI Center and Studio rows below show only what is built.
4. `sections.ts` and the Prisma schema are shared files with one owner at a time (A1.4): the shell delta D1 must be assigned to one builder; parts 1, 2, 4 add tabs to the same file.

## 1. Inbox  (real: section `support`, `/admin/support`, S22 PR 425-436, 538, 624; S23 PR 443)

| # | Item (prototype) | V | Evidence | Delta / what to build | Size | Depends on |
|---|---|---|---|---|---|---|
| I1 | Conversations: one list for Messenger, WhatsApp, website chat; Open/Mine/Unassigned/Done, search, assign, mark done, internal notes | M | `app/admin/support/page.tsx` (`INBOX_VIEWS`, search form), `packages/support` (PR 425 core, 426 Messenger + WhatsApp + live chat, 431 tickets, 434 own chats only), Blueprint B4.2 | Rename section label to "Inbox" (D1). Nothing else. | - | - |
| I2 | Instagram as a channel (DMs, merged by phone) | D | `packages/support/src/social-engagement.ts` (PR 443, inbound only, kind `instagram`). Reply goes out as NOT_SENT / CHANNEL_NOT_CONNECTED: no sender adapter | Instagram DM + Facebook comment reply sender behind the adapter (mock). Fold into N2 | M | N2; S23 switch |
| I3 | Customer side panel: name, photo, phone, all channels merged, orders, courier score, live order, grade, "Open Customer 360" | D | `components/admin/support/CustomerContext.tsx` (PR 428), `IdentityActions.tsx` (PR 427 "Same person"), `ChatBag.tsx` | Add grade badge (from Rules customer priority, part 2 builds grades), photo when the channel gives one, "Open Customer 360" in a new window | S | Customers part (360 page) |
| I4 | Phone typed in chat is captured and scanned against customers | M | PR 427 (`identity.ts`: number from the chat's words, Bengali or English digits, never from an amount) | - | - | - |
| I5 | "Send order link" with sizes in stock, "Create order" from chat | M | PR 429 `ProductDrawer.tsx`, PR 430 `ChatBag.tsx` (one-press order, channel tag, fraud gate) | Created order lands in Orders > Processing (status rename belongs to Orders part) | S | Orders part |
| I6 | Quick replies tab: short name + EN/BN text, `/name` in composer, archive not delete | **N** | `sections.ts` comment "Saved replies join with their PRs"; `docs/ADMIN-ARCHITECTURE.md` line 316 lists them; no model, no PR number in the register | New table `SupportSavedReply` (storeId, shortcut, bodyEn, bodyBn, archivedAt), tab, `/` picker in `Composer.tsx` beside the catalogue drawer. Additive migration. Seed the prototype's 8 sample replies as shop defaults (editable) | M | - |
| I7 | Response times: avg first reply, share inside 15 min, by channel and person, busiest hours, "Waiting for a reply" list | D | `app/admin/support/analytics` + `SupportAnalyticsTable.tsx` (PR 436: per channel/person/AI, first answer, solved-in, late, chat to order) | Add "waiting now, oldest first" list, share-inside-N-minutes (N a setting), hour-of-day chart. Header strip on Conversations (open, unassigned, avg first reply, longest wait) | S | - |
| I8 | Call desk: click to call, attempt log with outcomes per staff, retry schedule (30 min, 2 h, next day 11:00), 3 tries then a person decides | D | `/admin/orders/confirm/calls` (PR 545 "Calls to make", `orders.callOutcomes`, "Record call"); settings `registry-risk-s06.ts` | Attempt log per call (who, when, outcome), retry ladder as a setting (times, "auto-cancel after tries" off), "Call again now" badge, click-to-call (`tel:`), per-staff filter. Screen lives in Orders > Processing in the prototype: coordinate with Orders part | M | Orders part (Processing) |
| I9 | Comments view: Facebook and Instagram comments with chips All / Need a reply / Hidden / Auto-replied | D | PR 443: comments already arrive as conversations with a fixed "(public comment)" mark | Comments sub-view over those conversations (counts, chips, reply public or "Message privately") | M | N2 |
| I10 | Comment rules: hide comments with a phone number or abuse; price/size question triggers an automatic private message and a public reply; keyword list | **N** | Nothing: no hide, no auto reply (grep `hideComment`, `private_replies`: none) | Rules card + hide action (Graph API hide, mock) + private reply (mock). State on `Message`: `hiddenAt`, `hideReason`, `autoRepliedAt` (additive) | M | I9, N2 |
| I11 | Live selling: session with product codes, comments like "P1 L 2 pcs" become draft orders in Processing, "Make all" | **N** | Nothing (no live-session model, grep `live sell` in code and register: none) | `LiveSession`, `LiveCapture` tables, parser (code + size + qty, pure + tests), draft order via the chat-order path, always staff confirm by call. Needs a live-comments webhook field (mock until Page keys) | L | I9, Orders Processing |

## 2. Marketing  (real: section `marketing`, S13 PR 246-283, 531, 569, 589; Messages section S14 PR 289-300; Studio S23-S25)

Real Marketing has no Overview; its first tab is Smart Rules (`/admin/rules`). The prototype moves Rules to its own menu (D1).

| # | Item (prototype) | V | Evidence | Delta / what to build | Size | Depends on |
|---|---|---|---|---|---|---|
| M1 | Overview: spend, delivered sales, sales per Tk 1, cost per delivered order, profit after ads, period switch, AI line, "Needs your eye" | D | `/admin/marketing/report` (PR 283, spend vs Ordered value and delivered Sales by channel and campaign), `/admin/money/profit/channels` (PR 355, `packages/metrics/src/channels.ts`, "profit after ads = contribution - spend") | New first tab built from those two loaders; verdict thresholds Scale / Keep / Fix / Stop per Tk 1 as settings (defaults 4 / 2.5 / 1.5 from DECISIONS, editable, off-by-default policy per CN-018 means "shown" not "acted on") | M | D1 |
| M2 | Ad campaigns: all platforms (FB, IG, Google Search/Shopping/PMax, YouTube, TikTok) in one table with a verdict | D | `/admin/marketing/ad-platforms` (PR 259-261 read-only sync of campaigns and ad sets, 265 spend import `AdSpendDaily`, 531 new campaigns), `/admin/marketing/campaigns` (PR 256, the shop's own campaign model) | One table that joins ad-platform campaigns to ours, adds delivered ROAS (Sales delivered / spend) and the verdict chip | M | M1 |
| M3 | Campaign page: platform-claimed vs our orders vs delivered, ads with thumbnails and fatigue, daily chart, districts, products, funnel, AI note, Pause / Duplicate / Change budget (owner OK) | D | PR 265 keeps "the platform's purchases" per day (claimed side exists); PR 269 `growth-model.ts` has `fatiguePercent` per campaign; PR 531 draft/duplicate/re-budget behind `marketing.ads.approve`; PR 569 district return rates | Ad-level rows and thumbnails are NOT stored (only campaign and ad set): additive `AdCreativeDay` or ad dimension on `AdSpendDaily`; districts/products/funnel from orders by campaign tag. Pause/budget actions already exist: reuse, mock until keys | L | M2 |
| M4 | Message campaigns: WhatsApp / SMS / Email / Messenger, opted-in audience only, approved template, offer, schedule, throttle, cost estimate, test send, results (sent, delivered, orders, sales) | D | Messages section: PR 300 win-back campaigns (SMS or WhatsApp to one rule), 290 e-mail sends to a segment with throttle and log, 291 SMS parts, 298 consent, templates and log pages | One campaign form over any saved segment and any channel (reuses consent + templates + throttle), cost estimate from template prices, results by order attribution. Messenger broadcast: mock only (Meta 24-hour policy) | L | N6 |
| M5 | Automatic messages (journeys) shown beside campaigns | M | `/admin/messages/journey`, `/automations` (PR 505, 289, 300) | Keep pages; reach them from the Message campaigns tab ("Automatic messages") | S | D1 |
| M6 | Audiences: segments from own data (grade, area, bought, when), sync to Meta/Google, refused-parcel list left out | M | `/admin/marketing/audiences` (PR 262 builder), PR 264 refused-parcel exclusion list and daily refresh | - | - | - |
| M7 | Calendar: ads, messages, posts, sales, holidays; warnings when offers overlap or ads run on low stock | D | `/admin/marketing/calendar` (PR 282, under More options) | Promote to a tab; add the two warnings (overlap, low stock) if missing | S | D1 |
| M8 | Plan & ideas: budget by channel (next month), districts worth spending on, creative ideas, competitor watch, AI proposals awaiting OK | D | Districts: `/admin/marketing/geo-guide` (PR 569). Ideas: `/ad-platforms/briefs` (PR 270). Proposals: `/ad-platforms/growth` (PR 269, approvals). Competitor watch: PR 548 skipped (needs AI, waits for S15) | Assemble the page; add channel budget plan (new, derived from delivered ROAS bands, advice only, no auto spend). Competitor watch stays out (frozen) | M | N7 |
| M9 | Tools > Ad accounts (Pixel, server-side tracking, catalog status per platform) | M | `/ad-platforms` + `/marketing/tracking` (PR 257, 259-261, 532) | Show tracking status next to each account | S | - |
| M10 | Tools > Studio (photoshoot, video, social posts) | M | `/admin/marketing/studio`, `/motion`, `/models`, `/videos`, `/overlay` (PR 437-439, 444-450, 481-483, 489), hidden by `stages.closedShown.S23/S24/S25` | Show exactly what is built, no new work. Prototype's "jobs with Waiting for your OK" card is not built: omit | - | CN-047 |
| M11 | Tools > Influencers & affiliates: personal code, commission on delivered orders only, payout ledger, Pay (PIN), each payout is an expense in Finance | **N** | grep `affiliate`/`influencer`: 0 in schema and code. Related: referral programme PR 273 (customers' invite codes, no commission) | `Affiliate`, `AffiliateCode` (links a Smart Rule coupon), `AffiliatePayout` (append-only), commission computed on delivered Sales only (`@extas/metrics`), payout posts a cost line (PR 618 cost lines). Money action: owner OK and existing money permissions. Backend settings: commission %, hold days | L | Finance part (cost line category) |
| M12 | Tools > Landing pages | M | `/admin/marketing/landing` (PR 254, 255, 246, 530) | - | - | - |
| M13 | Tools > Refer a friend | M | `/admin/marketing/referrals` (PR 273) | - | - | - |
| M14 | Tools > Shopping feed: Google Shopping and Facebook catalog, issues list | D | `/admin/marketing/merchant-feed` + `/feeds/merchant.xml` (PR 589). No Facebook/Meta feed in code or blueprint | Add Meta catalogue feed (same product data, own field map), issue list per product | S | N5 |
| M15 | The 7-tab Marketing shape; Rules out; real extras kept | D | `sections.ts` marketing tabs: rules, campaigns, adPlatforms, tracking, landing, studio, referrals, youtube, outreach, seasonal, festive, calendar, report, geoGuide, merchantFeed | Map: Overview = report+profit; Ad campaigns = campaigns+adPlatforms+growth; Messages = Messages section campaigns/email/journeys; Audiences; Calendar; Plan = geoGuide+briefs; Tools = tracking(accounts), studio, influencers, landing(+seasonal), referrals, feed, plus youtube / outreach / seasonal home / festive under "More". Nothing deleted | M | D1 |

## 3. Website  (real: section `website`, S02 PR 76-81, 596-600; S11 PR 220-238; S12 PR 239-251, 591, 592)

| # | Item (prototype) | V | Evidence | Delta / what to build | Size | Depends on |
|---|---|---|---|---|---|---|
| W1 | Page layouts: blocks, order, hero, phone preview | M | `/admin/website/layouts` (PR 76, 77, 595), `LayoutBuilder.tsx`, `LayoutPreview.tsx` | - | - | - |
| W2 | Shop text: every storefront text by page (header, announcement, product, bag, checkout, invoice, SMS/WhatsApp, e-mail, footer), EN + BN, search, preview | D | `/admin/website/words` (PR 78 label dictionary, 104 words, both languages), `WordsEditor.tsx`; SMS/WhatsApp/e-mail texts are in `/admin/messages/templates` | Group by page with search, live preview; invoice and message texts appear as linked rows to Templates (one source, no duplicate) | S | - |
| W3 | Policies: 9 pages (Terms, Privacy, Delivery, Exchange, Payment & COD, Cancellation & Refund, Wallet & coupons, Reviews, Cookies), "at a glance" boxes, section cards with icons, numbers from Rules, EN/BN, store licence numbers, last updated + history | D | `/admin/settings/policies` (PR 384: FAQ, delivery, exchange and returns, privacy, terms, story, contact; `{rule.param}` tokens filled from live rules by `@extas/rules` `fillPolicyText`), PR 75 help pages, PR 383 store details | Move/link under Website. Add 5 pages (Payment & COD, Cancellation & Refund, Wallet & coupons, Reviews, Cookies). New page structure: at-a-glance boxes + section cards (stored as structured sections, not one text). Version history (append-only). No legal wording is added by the build: the owner's own text stays | M | - |
| W4 | Blog: board, categories, authors, calendar | M | `/admin/website/blog`, `/shelves`, `/calendar` (PR 239, 240, 245), plan 242, comments 251, performance 250, ads 592, pipeline 591 | Real has more than the prototype; keep under the Blog tab (sub-pages) | - | - |
| W5 | Blog editor: WordPress-like left post nav, block editor with Product / Combo / FAQ blocks, right panels (Publish, Categories, Tags, Featured image, Excerpt, Author, SEO like Yoast with score, checklist, readability, internal links, schema), autosave, preview, AI help | D | `JournalEditor.tsx` (PR 240: text in the journal's writing format, one-line answer, search description + focus keyword, up to 8 products, preview by `ArticleBody`, review history); PR 249 schema/BlogPosting/internal links (`InternalLinksCard.tsx`); PR 243 AI draft | Add Combo and FAQ blocks beside the Product block (FAQ block feeds FAQPage data, PR 224), SEO checklist panel with score + readability, autosave of drafts, left post list. Not a rewrite: keep the writing format, add blocks | L | - |
| W6 | Analytics > Overview: visitors, sessions, live now, sources, top pages, devices, districts, visit-to-order, 30-day chart | **N** | Nothing first-party: `TrackedEvent` (PR 257) serves ad conversions only; Cloudflare beacon is blocked/off (follow-up 725); Reports has no visitor report | First-party page-view events (privacy-safe, no IP stored beyond PR 382 rules), daily roll-up table, Overview page; sources from UTM and referrer; "live now" from last-5-minute events. Settings: collect on/off, keep days | L | - |
| W7 | Analytics > Search: Google + Bing impressions, clicks, CTR, position, queries with up/down | D | `/admin/website/seo/organic` (PR 238: clicks, impressions, position, top searches "when connected"), adapter `packages/adapters/src/search-console` (Google + Bing, PR 233), mock until keys | Query table with change vs previous period, Google/Bing switch, "new searches this week" | S | keys |
| W8 | Analytics > Behaviour: click heatmap, scroll depth, rage taps, funnels, checkout field drop-off, no-result searches, WhatsApp taps by page, size chart/colour opens to purchase | **N** | Parts built: no-result searches `/admin/reports/searches` (PR 72 f/u 100), WhatsApp/Messenger taps by place (PR 624, `SupportChannelTap`), rage/dead taps in Customer problems (PR 423), checkout stage of incomplete orders (PR 274). Missing: heatmap, scroll depth, funnel view, field drop-off, size-chart/colour opens | Behaviour events (click x/y per page type, scroll buckets, field focus/blur names only, never values), roll-ups, retention setting. Link the built parts instead of copying them | L | W6 |
| W9 | Analytics > Speed (Core Web Vitals by page type) | M | `VitalsCard.tsx` (PR 234, real visitors p75 + monthly 4G lab run), `/admin/reports/health/speed` (PR 417) | Show as the Speed sub-view (same data) | S | - |
| W10 | SEO & Google ranking: SEO score, positions for important searches, problems to fix, sitemap, redirects | D | `/admin/website/seo` + `/redirects`, `/categories`, `/bengali`, `/health` (PR 237), `/organic` (PR 238); PR 220-236 | One SEO score on top (from SEO health counts), "key searches" position list from Search Console rows. Redirects and sitemaps already exist | S | W7 |
| W11 | Website tab order and the "Visitors & funnel" report moved from Reports | D | `sections.ts` website tabs; extras eye-toggles (81), side canvas (596), launch default (597), on-page edit (600) | Order: Page layouts, Shop text, Policies, Blog, Analytics, SEO; extras under More. Reports' "Visitors & funnel" does not exist in real Reports: nothing to remove | S | D1 |

## 4. AI Center  (real: section `ai`, owner only, `/admin/ai`; S15 PR 304-311, 577-579; S21 PR 570; hidden while S15 closed)

| # | Item (prototype) | V | Evidence | Delta / what to build | Size | Depends on |
|---|---|---|---|---|---|---|
| A1 | AI Center as its own menu, badge for waiting approvals | M | `sections.ts` `id: 'ai'` (PR 646 Lumen, `aiCenterShown` in `lib/admin-shell/stages.ts`) | Menu position/label (D1). Count badge only when a queue exists (N/A while frozen) | - | CN-047 |
| A2 | AI agents tab: 7 agents, what each is doing, spend today / month, provider + model, schedule, monthly cap, pause switch, keep-on when AI is off | M | `/admin/ai` Control room (PR 304-309: master switch, keep-on, model, schedule, cap, 80% warning and 100% pause), `/admin/agents` (PR 577, 360 profile), `components/admin/ai/*` | Merge "Control room" and "Agents" under one tab name "AI agents" (label only) | S | - |
| A3 | Master switch strip with "when AI is off, staff and the shop see: <text>" (editable) | D | PR 305 master switch (`ai.enabled`) built; no editable fallback text found | One setting (`ai.offMessage`, EN + BN) shown on the strip; used wherever an AI box is hidden | S | - |
| A4 | Approvals: one queue of everything the AI wants to do, with why and effect, Approve / Reject, daily digest | **N** (frozen) | Pieces exist per area: growth proposals PR 269, risk approval digest PR 540, fixes to approve PR 420, blog topic approvals PR 244, support drafts PR 432. No single queue | Not proposed: S15 is frozen (CN-047) and the queue is AI work. Tab stays absent. Reconsider when the owner resumes S15 | - | S15 |
| A5 | Costs & limits: monthly ceiling for AI, SMS and WhatsApp, running chart, cap per agent, cost-saver mode | D | Per-agent cap PR 309; `/admin/money/cost-ledger` + `/report` (PR 343, 347: every paid call's cost, AI against its cap, export); message caps in `/admin/messages/channels` | Page that shows agent caps + the cost report. SMS/WhatsApp monthly ceiling with 80% warning is new (N15). Cost-saver mode is AI work: frozen | S | N15 |
| A6 | Training: instructions, corrections, documents, forbidden topics, sandbox, version history | **N** (frozen) | PR 579 is curriculum/certification, not this | Not proposed (S15 frozen); tab absent | - | S15 |
| A7 | Real tabs the prototype lacks: Checklist audit, Agent reports, curriculum | D | PR 570 (`/admin/ai/audit`), 578 (`/admin/ai/reports`), 579 | Keep under "More" (nothing deleted) | S | - |

## 5. Shell

Real shell files: `components/admin/shell/AdminShell.tsx`, `ShellParts.tsx`, `Palette.tsx`, `NotificationsPanel.tsx`; `lib/admin-shell/{sections,lumen-nav,search,stages}.ts`; styles `app/admin/lumen-shell.css`, `theme/lumen.css`. Spec: `docs/demo/admin-look/LUMEN-SPEC.md` section 2.

| # | Item (prototype) | V | Evidence | Delta / what to build | Size | Depends on |
|---|---|---|---|---|---|---|
| S1 | Left menu structure and order: Home, Orders, Couriers, Products, Customers, Inbox, Rules, Marketing, Website, Finance, Reports, AI Center, Settings, Admin map | D | Real order (`lumen-nav.ts`): Daily = Dashboard, Orders, Delivery, Products, Customers; Grow = Marketing, Messages, Website, Support; Business = Money, Reports; System = AI, Settings, Help | The prototype order fits the four Lumen groups: Daily = Home, Orders, Couriers, Products, Customers, Inbox, Rules; Grow = Marketing, Website; Business = Finance, Reports; System = AI Center, Settings (Help stays; "?" is built). Renames: Dashboard to Home, Delivery to Couriers (route `/admin/delivery` kept), Support to Inbox, Money to Finance. Messages section folds into Marketing > Message campaigns (its pages stay, nothing deleted). Rules becomes its own section (today the first Marketing tab) | M | D1 owner |
| S2 | Icons: consistent set, one per section | D | `ShellIcon.tsx`, `lib/admin-shell/icons.ts` (grid, bag, shirt, users, truck, msg, headset, mega, globe, wallet, chart, spark, sliders, help) | Add icons for Rules and Couriers (truck is used by Delivery today: keep), Inbox keeps headset or msg. 3 new glyphs at most | S | S1 |
| S3 | Collapse behaviour: a click on the open menu (or double-click) folds its sub-menu | D | `AdminShell.tsx`: the chevron (`lm-chv`) toggles the accordion; the section name always navigates; separate icons-only collapse (cookie) exists | Click on the active section's name toggles the fold instead of navigating again; double-click the same. Keep chevron and icons-only collapse | S | - |
| S4 | EN / bang toggle | M | `LangSwitch.tsx`, `ADMIN_LANG_COOKIE`, `messages/admin-*.{en,bn}.json` | - | - | - |
| S5 | Global search (orders, products, customers, pages) | M | `Palette.tsx` + `lib/admin-shell/search.ts` (Ctrl/Cmd K and "/"; pages, settings cards, products, orders by number/phone/tracking, customers, actions, help; permission-aware) | Superset of the prototype | - | - |
| S6 | Notifications panel | M | `NotificationsPanel.tsx` (unread count, each note opens its page, Mark all read), badges via `/api/admin/shell/badges` | - | - | - |
| S7 | Theme (light/dark) | M | moon button, `lib/admin-look/theme.ts`, kept on the account (PR 626, 630) | - | - | - |
| S8 | Admin look: is the prototype a new look? | D | See table below | **Keep Lumen.** Apply prototype's structure only | - | - |
| S9 | Responsive at 390 / 768 / 1366 / 1920 | D | `lumen-shell.css`: below 900 px icons only, below 760 px a bottom bar that scrolls sideways with every section; the device gate runs 390/768/1366/1920 (CLAUDE.md rule 5/9) | Prototype: below 960 px a hamburger drawer plus a fixed 5-item bottom bar (Home, Orders, Products, Inbox, Reports). Real is a superset (every section reachable): keep. Only deliver new sections through the same bars | S | S1 |
| S10 | Admin map: every page with one line, in-page window in the prototype, **new window** on the real site | **N** | grep `admin map`: only in these prototype docs. `js/map.js` holds the one-liners (`D = {...}`) | `/admin/map` page generated from `sections.ts` + each page's guide first line; opens in a new window from the menu foot and from the "?" panel | S | S1 |
| S11 | "?" page guide (What / Why / How per tab) | M | `GuidePanel.tsx`, `docs/admin-guide/` (CN-014, CN-026, PR 594) | Update guides for every changed screen (CLAUDE.md CN-026) | - | each PR |
| S12 | Menu count badges (orders to confirm, inbox, AI) | M | `AdminShell.tsx` badges, `admin.shell.badgeCacheSeconds` | Point the Orders badge at the Processing count when Orders part lands | S | Orders part |
| S13 | Top bar: View shop, Help, bell, moon, language; sample-data pill | M | `AdminShell.tsx` (`lm-shop`, guide, bell, moon, EN/bang). The "Prototype - sample data" pill is a prototype aid: not built | - | - | - |
| S14 | Polish: tabular numbers, nicer icons, charts with area fill, faint grid, emphasised last point, tooltips | D | Lumen: self-hosted fonts, `HeroChart.tsx` (PR 627, hover read-out, plain SVG), count-up tiles | Check `HeroChart` for area fill / last-point marker / faint grid; add `font-variant-numeric: tabular-nums` on numeric cells if missing. The prototype's 10 chart types (donut, funnel, waterfall...) are built by the section parts as needed, on the same plain-SVG base | S | - |

### S8. Prototype look vs Lumen: exactly what differs

| Thing | Prototype v5 (`css/app.css`) | Real Lumen (`LUMEN-SPEC.md`, `theme/lumen.css`) |
|---|---|---|
| Accent | burnt orange `#c2410c` (dark `#f0703a`) | coral `#FF5A36` (dark `#FF6B47`), a setting (six swatches, PR 630) |
| Page background | `#eef0f6` / dark `#0f1220` | `#ECEFF5` / dark `#080D1F` (near equal in light) |
| Hero card | navy gradient `#1b2453` to `#2b3a80` | `#0E1A38` to `#1B2C66` plus a coral glow |
| Fonts | Inter, Inter Tight, Hind Siliguri (Google Fonts link) | Bricolage Grotesque, Plus Jakarta Sans, Hind Siliguri, self-hosted |
| Radius | cards 14 px | cards 22 px, buttons and inputs 12 px, floating sidebar 24 px |
| Sidebar | full-height sticky bar, 252 px, border line, flat | floating, inset 12 px, rounded, 248 px, icons-only collapse (72 px) with fly-out |
| Menu grouping | one flat list, no group titles | four groups (Daily, Grow, Business, System) |
| Phone | hamburger drawer + fixed 5-item bottom bar | bottom bar that scrolls sideways with all sections |
| Motion | none beyond reduced-motion rule | count-up numbers, line draw, row slide-out, Undo toast |
| Layout skeleton, cards, KPIs, tables, tabs, drawers, command palette, bell, moon, EN/bang | same pattern | same pattern |

**Verdict:** the prototype is not a new look; it is a plainer, hand-built cousin of Lumen with the same skeleton. The visible deltas are accent colour, fonts, corner radius and the flat sidebar. The owner approved the prototype's screens and flows, not a re-skin: recommended default is **keep Lumen** (already merged, tested at four widths, dark mode, contrast gates) and, if the owner wants the burnt-orange accent, it is one swatch in Settings > Admin look (`admin.theme.accent`), no code. This choice is reversible and needs no decision from the owner now; record it in the CN-048 note.

## 6. Cross-cutting rules from DECISIONS.md

| # | Rule | V | Evidence | Delta / what to build | Size | Depends on |
|---|---|---|---|---|---|---|
| X1 | Staff limits: export permission | M | `packages/auth/src/catalogue.ts`: `orders.export`, `orders.exportPersonal`, `catalogue.export`, `customers.export` (off until the owner turns it on) | Show in the staff limits table as read-only rows | S | N11 |
| X2 | Staff limits: discount limit per role (price adjust above limit asks the owner, Telegram works) | **N** | No per-role discount limit in the auth catalogue or settings (grep `discountLimit`: none); `orders.edit` only | Setting per role (Tk and %, empty = no limit, owner approval above). Used by Orders price adjust (part 1) | M | Orders part, N12 |
| X3 | End-of-day cash / bKash handover sheet per staff | **N** | grep `handover` cash: only courier hand-over (PR 181). No cash model | `CashHandover` (day, staff, expected, counted, note) append-only; Finance reads it. Backend switch + time | M | Finance part |
| X4 | Eid / peak mode: daily capacity cap, cut-off dates change promise texts, Print all in parts, roster | D | Eid order-by dates and holiday mode PR 193, festive rules and cut-off words PR 214, 281, seasonal pages PR 246, 530, Rules > Eid | Missing: daily capacity cap (stops promising when full), "Print all" in parts, roster. Capacity as a setting | M | Orders part (print) |
| X5 | Bulk / corporate orders: quote, agreed price, advance + balance, company invoice, delivery in batches | D | PR 606: `/bulk-order` enquiry, `BulkEnquiry`, `GET /api/admin/bulk-enquiries`; Blueprint BACKEND-ARCHITECTURE ORD-09 (`/admin/orders/bulk/{id}`) specified, not built | Admin screen ORD-09 + quote, advance/balance (existing advance path PR 558), company invoice (PR 407 invoices), batches as linked orders | L | Orders part |
| X6 | Telegram: urgent approvals with PIN | **N** | `packages/adapters/src/telegram` is send-only (PR 392 alerts, 538 escalation). No inbound bot, no approval | Inbound webhook, one-time approval request with button, owner's existing confirm step as the check (not a new PIN store), audited. Mock until the bot key | L | Keys & connections |
| X7 | Never delete, archive; money/price/discount/budget changes ask for PIN | M | CLAUDE.md hard rules 3 and 6 (nothing deleted; owner's written OK); existing confirm steps | The prototype's "any 4 digits" PIN is a stand-in: real = existing permission + confirm, no new PIN system | - | - |
| X8 | Packer role sees no phone / address | **N** | PR 434 masks numbers only in support; no packer role (schema mentions "packer" only in a comment) | Role preset + masking on pack and print screens; additive, no schema | S | N11 |
| X9 | Influencers & affiliates | see M11 | - | - | - | - |
| X10 | Comments and live selling | see I9-I11 | - | - | - | - |

Mock-only until keys: Meta comment hide, private reply and Instagram DM send, live-comment capture, Telegram inbound, Search Console / Bing, Meta catalogue feed, WhatsApp / SMS sending, ad-platform pause and budget writes, Messenger broadcast, Studio providers.

Additive schema needed: `SupportSavedReply`; `Message.hiddenAt/hideReason/autoRepliedAt`; `LiveSession`, `LiveCapture`; `Affiliate`, `AffiliateCode`, `AffiliatePayout`; ad-level day rows (`AdCreativeDay` or a dimension on `AdSpendDaily`); first-party `PageViewDay`/`BehaviourEvent` roll-ups; `CashHandover`; structured policy sections + history; bulk quote and batches; settings only (no tables) for verdict thresholds, capacity cap, call retry ladder, AI-off text, role discount limits.

## 7. Proposed new register PRs (numbers assigned at register time, next free after 658)

| Ref | Title | One-line scope | Size |
|---|---|---|---|
| N1 | Saved replies | Quick replies tab, `/` picker in the composer, EN/BN, archive not delete | M |
| N2 | Comment desk | Comments sub-view, hide phone/abuse, comment to private reply rules, Facebook comment + Instagram DM sender (mock) | M |
| N3 | Live-selling capture | Live session, product codes, comment parser, draft orders in Processing | L |
| N4 | Influencers & affiliates | Personal code, commission on delivered orders, payout ledger, cost line in Finance | L |
| N5 | Meta catalogue feed | Facebook/Instagram product feed beside the Google feed, issue list | S |
| N6 | Message campaigns v5 | Any segment, any channel, template, schedule, throttle, cost estimate, results | L |
| N7 | Budget plan | Channel budget plan from delivered ROAS bands (advice only) and the Plan & ideas page | M |
| N8 | Website Analytics: visitors | First-party page views, Overview (visitors, live now, sources, top pages, devices, districts) | L |
| N9 | Website Analytics: behaviour | Heatmap, scroll depth, funnels, field drop-off, size-chart/colour opens; links the built parts | L |
| N10 | Admin map | `/admin/map` new window from `sections.ts` + guides | S |
| N11 | Staff controls | Discount limit per role, end-of-day handover, packer masking | M |
| N12 | Telegram approvals | Inbound bot, approve/reject urgent items (price adjust, budget raise), audited | L |
| N13 | Eid / peak mode | Daily capacity cap, Print all in parts, roster | M |
| N14 | Bulk / corporate screen | ORD-09 quote, agreed price, advance + balance, company invoice, batches | L |
| N15 | Message cost ceilings | Monthly SMS/WhatsApp ceiling, 80% warning, cheapest-channel fallback | S |

Not proposed (frozen by CN-047): AI Approvals queue (A4), AI Training (A6), cost-saver mode (part of A5).

## 8. Delta follow-ups on existing PRs

| Ref | On PR | Delta | Size |
|---|---|---|---|
| D1 | 12, 625, 626 | Shell alignment: menu order/groups/renames, Rules as own section, Messages into Marketing, section-click fold, 3 icons (S1-S3, S9). One owner for `sections.ts`, `lumen-nav.ts`, `admin-shell.*.json` | M |
| D2 | 283, 355 | Marketing Overview tab with profit after ads, verdict settings (M1) | M |
| D3 | 259-261, 265, 269, 531 | Ad campaigns table with verdict and the campaign page; ad-level rows for fatigue (M2, M3) | L |
| D4 | 282 | Calendar as a tab, overlap and low-stock warnings (M7) | S |
| D5 | 569, 270, 269 | Plan & ideas assembly (M8) | S |
| D6 | 300, 290, 291 | Marketing > Message campaigns entry; journeys reachable from it (M4, M5) | S |
| D7 | 257, 259-261 | Tracking status beside each ad account (M9) | S |
| D8 | 589 | Feed tab names and issue list (M14) | S |
| D9 | 436 | Response times: waiting list, share inside N minutes, hour chart, header strip (I7) | S |
| D10 | 427, 428 | Grade badge, photo, Customer 360 in a new window (I3) | S |
| D11 | 545 | Call desk: attempt log, retry ladder, per-staff, click-to-call (I8) | M |
| D12 | 443 | Comments sub-view counts and chips (I9, shares work with N2) | S |
| D13 | 78 | Shop text by page with search and preview, links to Templates (W2) | S |
| D14 | 384, 75, 383 | Policies: 5 new pages, at-a-glance + section cards, history, placed under Website (W3) | M |
| D15 | 240, 249, 243, 224 | Blog editor: Combo + FAQ blocks, SEO checklist, readability, autosave (W5) | L |
| D16 | 238, 233 | Analytics > Search query table with change and Google/Bing switch (W7) | S |
| D17 | 234, 417 | Analytics > Speed as a sub-view of Analytics (W9) | S |
| D18 | 237, 238 | SEO score on top, key-search positions (W10) | S |
| D19 | 76-81, 596-600 | Website tab order, extras under More (W11) | S |
| D20 | 304, 305, 577 | AI tab names, AI-off message setting, extras under More (A2, A3, A7) | S |
| D21 | 309, 343, 347 | Costs & limits page assembled from agent caps and the cost report (A5) | S |
| D22 | 627 | Chart and number polish check (S14) | S |

## 9. Order of work (for the Wave 5 builders)

1. D1 first (shell, one owner), then N10 (admin map).
2. Inbox: D9, D10, D11 with N1, N2, then N3 (needs Orders Processing from Wave 1).
3. Marketing: D2, D3, D4-D8, N5, N6, N7, N4 (needs Finance cost line), N15.
4. Website: D13, D14, D16-D19, D15, then N8 before N9.
5. Shell cross-cutting: N11, N13, N14, N12 last (they depend on Orders and Finance parts).
6. AI: D20, D21 only.
