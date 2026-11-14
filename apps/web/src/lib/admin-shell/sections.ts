// PR 12 (CN-018, CN-022) — the new admin's 14 sections as data (docs/BACKEND-ARCHITECTURE.md §5.1, decision D8; demo
// V12.3 97p-adm2-sections.js). Each section lists only the tabs that are BUILT (no dead links); what is planned is a
// line in the section's placeholder (`shell.plan.<id>`). Each tab is one or more existing pages: the tab opens the
// first page the person may open, and its sub-pages form the small chips under the tabs (Stock › Counts …).
// Labels: messages/admin-shell.<lang>.json (`shell.sec.<id>`, `shell.tab.<id>.<tab>`). No React, no database: the
// client shell, the server pages and the search all read this one table.
import type { PermissionKey } from '@extas/auth';
import type { AdminSectionId } from '@extas/settings';
import type { ShellIconName } from './icons';
import { applyNavV5 } from './nav-v5';

export interface ShellPage {
  /** The page's address; a page also owns every address under it that no other page owns. */
  href: string;
  /** The permission its own page asks for (the page re-checks it). */
  perm: PermissionKey;
  /** The `current` keys pages pass to the frame (ADMIN_PAGES keys, or a native page's own id). */
  keys: readonly string[];
}

export interface ShellTab {
  id: string;
  pages: readonly ShellPage[];
  /** Under "More ▾". */
  more?: boolean;
  /** The tab's own guide, when it is not the section's. */
  guide?: string;
}

export type ShellGroup = 'daily' | 'grow' | 'business' | 'bottom';

export interface ShellSection {
  id: AdminSectionId;
  icon: ShellIconName;
  group: ShellGroup;
  /** The section's own address: its placeholder while nothing is built there (the Dashboard: the admin's front door). */
  base: string;
  tabs: readonly ShellTab[];
  /** Keys that show the section even with no built tab (a section with neither shows for the owner only). */
  perms?: readonly PermissionKey[];
  /** The owner only, whatever the keys (AI Center while AI is off, §5.1). */
  ownerOnly?: boolean;
  /** The admin guide (docs/admin-guide/<slug>.md). */
  guide: string;
  /**
   * PR 659: a section whose pages moved into another section (Messages, now Marketing › Message campaigns). It stays in
   * the table so its id, its words and its saved settings are never lost, but it has no menu entry and no tabs.
   */
  folded?: boolean;
}

export const SHELL_GROUPS: readonly Exclude<ShellGroup, 'bottom'>[] = ['daily', 'grow', 'business'];

// PR 659 (CN-048): the list below is every built page in the section it was built for; `SHELL_SECTIONS` below it is the
// same list as the prototype v5 menu draws it (nav-v5.ts: tab order and words, the rest under More).
export const RAW_SECTIONS: readonly ShellSection[] = [
  { id: 'dashboard', icon: 'home', group: 'daily', base: '/admin', tabs: [], perms: ['dashboard.read'], guide: 'dashboard' },
  // S05 (PR 140, 141; follow-up 200): All orders (and one order's page) and the To confirm call queue. Risk review,
  // packing, returns and the order settings join as their PRs are built. `orders.invoice` alone no longer shows the
  // section (its pages need orders.read); the palette still opens invoices for that key.
  {
    id: 'orders',
    icon: 'bag',
    group: 'daily',
    base: '/admin/orders',
    guide: 'orders',
    tabs: [
      { id: 'all', pages: [{ href: '/admin/orders', perm: 'orders.read', keys: ['orders', 'order'] }] },
      // PR 660 (CN-048): this tab is "Processing" in the menu — the call queue and its calls, now over the Processing view (address unchanged)
      // S06 · PR 545: Calls to make — the call tasks the shop's steps left (a new customer among them), worked by a person
      { id: 'confirm', pages: [
        { href: '/admin/orders/confirm', perm: 'orders.confirm', keys: ['ordersConfirm'] },
        { href: '/admin/orders/confirm/calls', perm: 'orders.confirm', keys: ['ordersCalls'] },
      ] },
      // S28 · PR 661 (CN-048): Batch — every order not yet handed to the courier (Current) and the handed-over sheets (Past).
      { id: 'batch', pages: [{ href: '/admin/orders/batch', perm: 'orders.read', keys: ['ordersBatch'] }] },
      // PR 660 (CN-048): this tab is "To ship" in the menu (pack, print, picking list, invoices); the rider's handover is the With courier tab
      // S08 · PR 179–181: Packing & print (ORD-04) — the print run of courier stickers, the daily picking list and the
      // rider's handover. PR 182: Pack (pick, pack and hand over on one screen) is the tab's first page; S20 · PR 407: the invoices.
      {
        id: 'packing',
        pages: [
          { href: '/admin/orders/packing', perm: 'fulfilment.read', keys: ['packingPack'] },
          { href: '/admin/orders/packing/print', perm: 'fulfilment.read', keys: ['packingPrint'] },
          { href: '/admin/orders/packing/picking', perm: 'fulfilment.read', keys: ['packingPicking'] },
          // S20 · PR 407: the customers' invoices — the list, printing (paper, roll, chat picture) and the invoice's settings
          { href: '/admin/orders/packing/invoices', perm: 'fulfilment.read', keys: ['packingInvoices'] },
        ],
      },
      // PR 660 (CN-048): With courier — the rider's handover and the day-end check (PR 667 adds the live courier status and the stuck-parcel alert).
      { id: 'courier', pages: [{ href: '/admin/orders/packing/handover', perm: 'fulfilment.read', keys: ['packingHandover'] }] },
      // S08 · PR 185, 187, 191: Returns & exchanges (the board, a case, starting an exchange) and Receive & QC.
      {
        id: 'returns',
        pages: [
          { href: '/admin/orders/returns', perm: 'returns.view', keys: ['ordersReturns'] },
          // PR 187: Receive & QC (ORD-05a)
          { href: '/admin/orders/returns/qc', perm: 'returns.qc', keys: ['ordersReturnsQc'] },
          // PR 191: refused parcels and the refused-parcel list a person decides
          { href: '/admin/orders/returns/refused', perm: 'returns.view', keys: ['ordersReturnsRefused'] },
          // CN-028 · PR 612: the hand-back desk (ERP contract v6) — the courier's returned parcels counted and sent to the ERP
          { href: '/admin/orders/returns/handback', perm: 'returns.handback', keys: ['ordersReturnsHandback'] },
          // CN-028 · PR 613: the Returns section on the ERP — what the owner decided, losses, claims, the nightly compare
          { href: '/admin/orders/returns/erp', perm: 'returns.view', keys: ['ordersReturnsErp'] },
        ],
      },
      // S13 · PR 274: Incomplete — typed at checkout and left without ordering (All orders links it as a saved view)
      { id: 'incomplete', pages: [{ href: '/admin/orders/incomplete', perm: 'orders.read', keys: ['ordersIncomplete'] }] },
      // S06 · PR 540: Today's digest — what came in, what the engine saw, and what waits for a person's OK (the gate's card)
      { id: 'digest', more: true, pages: [{ href: '/admin/orders/digest', perm: 'orders.read', keys: ['ordersDigest'] }] },
      // S06 · PR 161: ORD-06 Risk rules (its Levels section first; the matrix and the rule switches join with their PRs);
      // S04 · PR 558: its Checkout advance panel (the Parameter for Checkout) is the tab's second page
      { id: 'riskrules', more: true, pages: [
        { href: '/admin/orders/risk-rules', perm: 'risk.rules.read', keys: ['riskRules'] },
        { href: '/admin/orders/risk-rules/checkout', perm: 'risk.rules.read', keys: ['checkoutAdvance'] },
      ] },
    ],
  },
  {
    id: 'products',
    icon: 'shirt',
    group: 'daily',
    base: '/admin/products',
    guide: 'products',
    tabs: [
      { id: 'all', pages: [{ href: '/admin/products', perm: 'catalogue.read', keys: ['products', 'product'] }] },
      // PR 659 (CN-048): "Add product" is a tab of its own (the prototype's; the 8-step wizard of PR 685 opens from it)
      { id: 'add', pages: [{ href: '/admin/products/new', perm: 'catalogue.write', keys: ['productNew'] }] },
      { id: 'queue', pages: [{ href: '/admin/products/queue', perm: 'catalogue.read', keys: ['publishQueue'] }] },
      // S28 · PR 686: Products → Shop ranking — the score of each product by the owner's weights and the order the shop shows.
      { id: 'ranking', pages: [{ href: '/admin/products/ranking', perm: 'catalogue.read', keys: ['productRanking'] }] },
      // S02 · PR 598 — the bag's "Take 2 | Take 3 | Take 4" box (its switch, days, rules shown, own words), beside the combos.
      { id: 'combos', guide: 'combos', pages: [{ href: '/admin/combos', perm: 'combos.read', keys: ['combos'] }, { href: '/admin/combos/bag-box', perm: 'combos.read', keys: ['combosBagBox'] }] },
      {
        id: 'stock',
        guide: 'stock',
        pages: [
          { href: '/admin/stock', perm: 'inventory.read', keys: ['stock'] },
          { href: '/admin/stock/counts', perm: 'inventory.read', keys: ['stockCounts', 'stockCount'] },
          { href: '/admin/stock/movements', perm: 'inventory.read', keys: ['stockMovements'] },
          { href: '/admin/products/back-in-stock', perm: 'catalogue.read', keys: ['backInStock'] },
        ],
      },
      { id: 'charts', guide: 'size-charts', pages: [{ href: '/admin/size-charts', perm: 'catalogue.read', keys: ['sizeCharts'] }] },
      // S14 · PR 295: Reviews (PRD-07) — the review manager behind the Day-3 review request
      {
        id: 'reviews',
        pages: [
          { href: '/admin/products/reviews', perm: 'reviews.read', keys: ['productReviews'] },
          // PR 66 follow-up 184: the customers' product questions — answer, publish, hide, archive
          { href: '/admin/products/questions', perm: 'reviews.read', keys: ['productQuestions'] },
        ],
      },
      {
        id: 'import',
        more: true,
        pages: [
          { href: '/admin/products/import', perm: 'catalogue.import', keys: ['productImport'] },
          // PR 609 (CN-028): import from the ERP by style code
          { href: '/admin/products/erp-import', perm: 'catalogue.import', keys: ['erpImport'] },
        ],
      },
      { id: 'audit', more: true, pages: [{ href: '/admin/products/audit', perm: 'catalogue.read', keys: ['productAudit'] }] },
    ],
  },
  // S14 · PR 284: To review (CUS-05) — the merge rules' "Same person?" pairs and the decisions made. PR 285: All
  // customers (CUS-01), the section's front page.
  {
    id: 'customers',
    icon: 'users',
    group: 'daily',
    base: '/admin/customers',
    guide: 'customers',
    tabs: [
      { id: 'all', pages: [{ href: '/admin/customers', perm: 'customers.read', keys: ['customers', 'customer'] }] },
      // PR 287: Segments (CUS-03) and one segment's builder (CUS-03a), in the demo's order
      { id: 'segments', pages: [{ href: '/admin/customers/segments', perm: 'customers.read', keys: ['customersSegments'] }] },
      // PR 296: Loyalty & wallet (CUS-04) — the points and the wallet's newest lines, with the points card
      { id: 'loyalty', pages: [{ href: '/admin/customers/loyalty', perm: 'customers.read', keys: ['customersLoyalty'] }] },
      { id: 'review', pages: [{ href: '/admin/customers/review', perm: 'customers.read', keys: ['customersReview'] }] },
      // PR 288: the CRM switches and numbers, under More
      // PR 535: the legacy customer import (CUS-06), under More
      { id: 'import', more: true, pages: [{ href: '/admin/customers/import', perm: 'customers.read', keys: ['customersImport'] }] },
      { id: 'settings', more: true, pages: [{ href: '/admin/customers/settings', perm: 'customers.read', keys: ['customersSettings'] }] },
    ],
  },
  {
    id: 'delivery',
    icon: 'truck',
    group: 'daily',
    base: '/admin/delivery',
    guide: 'delivery',
    tabs: [
      // S28 · PR 670 (CN-048): the Couriers section opens on its Overview (every courier at a glance) and Courier 360 (one courier, eight sections; the default courier first)
      { id: 'overview', pages: [{ href: '/admin/delivery', perm: 'delivery.read', keys: ['couriersOverview'] }] },
      { id: 'courier360', pages: [{ href: '/admin/delivery/courier-360', perm: 'delivery.read', keys: ['courier', 'courierStatement'] }] },
      { id: 'zones', pages: [{ href: '/admin/delivery/zones', perm: 'delivery.read', keys: ['delivery'] }] },
      // PR 554: the courier accounts with their area lists (the zone sync); one courier's area pairs are under it
      { id: 'couriers', pages: [{ href: '/admin/delivery/couriers', perm: 'delivery.read', keys: ['couriers', 'courierAreas'] }] },
      // S08 · PR 193 — Delivery settings (demo /admin/delivery/settings): holiday mode first; the other cards join with their PRs
      { id: 'settings', pages: [{ href: '/admin/delivery/settings', perm: 'delivery.read', keys: ['deliverySettings'] }] },
    ],
  },
  // PR 659 (CN-048): Messages is no section of its own any more: its pages are Marketing › Message campaigns. The id stays
  // (saved settings, words, the guide); it has no menu entry. The pages and their addresses are unchanged.
  { id: 'messages', icon: 'msg', group: 'grow', base: '/admin/messages', tabs: [], guide: 'comms', folded: true },
  // S22 · PR 425: the Inbox (one conversation's page is under it) and Support settings. Rider issues, Claims & credits
  // and Saved replies join with their PRs.
  {
    id: 'support',
    icon: 'inbox',
    group: 'daily',
    base: '/admin/support',
    guide: 'support',
    tabs: [
      { id: 'inbox', pages: [{ href: '/admin/support', perm: 'support.read', keys: ['supportInbox', 'supportConversation'] }] },
      { id: 'settings', pages: [{ href: '/admin/support/settings', perm: 'support.read', keys: ['supportSettings'] }] },
      // S08 · PR 192 — SUP-02 Rider issues: a rider took more than the parcel asked; logged with proof, approved by a person.
      { id: 'riderIssues', pages: [{ href: '/admin/support/rider-issues', perm: 'support.read', keys: ['supportRiderIssues'] }] },
      // S22 · PR 435 — the support app: install it, notifications on this device (each person their own).
      { id: 'app', pages: [{ href: '/admin/support/app', perm: 'support.read', keys: ['supportApp'] }] },
      // S22 · PR 436 — support analytics: per channel and per person, first answer, solved in, chat → order (B4.13).
      { id: 'analytics', pages: [{ href: '/admin/support/analytics', perm: 'support.read', keys: ['supportAnalytics'] }] },
    ],
  },
  // PR 659 (CN-048): Rules is its own section (it was Marketing's first tab). PR 676–678: All rules (one page), Offers & discounts, Pop-ups & notices.
  {
    id: 'rules',
    icon: 'rules',
    group: 'daily',
    base: '/admin/rules',
    guide: 'rules',
    tabs: [
      {
        id: 'all',
        guide: 'rules',
        pages: [
          // S28 · PR 676: the one-page list of every rule; the Smart Rules editor (PR 209–219) is /admin/rules/smart
          { href: '/admin/rules', perm: 'rules.read', keys: ['rules'] },
          { href: '/admin/rules/smart', perm: 'rules.read', keys: ['rulesSmart'] },
          // S08 · PR 193 — Eid order-by dates, the "may arrive after Eid" line and Eid pre-order (CN-014 g)
          { href: '/admin/rules/eid', perm: 'rules.read', keys: ['eidDates'] },
        ],
      },
      // S28 · PR 677: Offers & Discounts 360 (offers, coupons, built-in price rules, the online-payment reward, points, wallet)
      { id: 'offers', pages: [{ href: '/admin/rules/offers', perm: 'rules.read', keys: ['rulesOffers'] }] },
      // S28 · PR 678: the hub of the shop's twelve system pop-ups and notices, then the owner's own notices (PR 216)
      { id: 'popups', pages: [{ href: '/admin/rules/notices', perm: 'rules.read', keys: ['notices'] }] },
    ],
  },
  {
    id: 'marketing',
    icon: 'mega',
    group: 'grow',
    base: '/admin/marketing',
    guide: 'ads',
    tabs: [
      // S13 · PR 256: campaigns — audience, offer, creative, window and the planned budget (`/admin/marketing/campaigns/<id>`).
      { id: 'campaigns', pages: [{ href: '/admin/marketing/campaigns', perm: 'marketing.campaigns.read', keys: ['marketingCampaigns', 'marketingCampaign'] }] },
      // PR 659: the Smart Rules moved to their own section (Rules); Messages joined here as Message campaigns.
      {
        id: 'messages',
        guide: 'comms',
        pages: [
          { href: '/admin/messages/campaigns', perm: 'messages.journey.read', keys: ['messagesCampaigns'] },
          { href: '/admin/messages/journey', perm: 'messages.journey.read', keys: ['messagesJourney'] },
          // PR 289: customer journeys (product-life reminder, win-back, welcome)
          { href: '/admin/messages/automations', perm: 'messages.journey.read', keys: ['messagesAutomations'] },
          // PR 290: e-mail marketing — the owner's e-mail templates, e-mail sends to a segment and their delivery log
          { href: '/admin/messages/email', perm: 'messages.journey.read', keys: ['messagesEmail'] },
          { href: '/admin/messages/templates', perm: 'messages.templates.read', keys: ['messagesTemplates'] },
          { href: '/admin/messages/log', perm: 'messages.log.view', keys: ['messagesLog'] },
          // PR 291, 298: Channels & limits and Consent
          { href: '/admin/messages/channels', perm: 'messages.channels.read', keys: ['messagesChannels'] },
          { href: '/admin/messages/consent', perm: 'messages.consent.view', keys: ['messagesConsent'] },
        ],
      },
      // S13 · PR 262: audiences from real orders — the list and the builder (`/admin/marketing/audiences/<id>`, `new`).
      { id: 'audiences', pages: [{ href: '/admin/marketing/audiences', perm: 'marketing.audiences.read', keys: ['marketingAudiences', 'marketingAudience'] }] },
      // S13 · PR 259: the ad accounts as the platforms see them (read only; Meta first, TikTok PR 260, Google PR 261).
      // PR 269: the growth agent (`/admin/marketing/ad-platforms/growth`) sits under Ad platforms; PR 270: so do the
      // creative briefs (`/admin/marketing/ad-platforms/briefs`); PR 531: and the new campaigns (`…/ad-platforms/campaigns`).
      // PR 581: Tirondaj's own guardrails sit under Ad platforms too (`…/ad-platforms/guardrails`).
      { id: 'adPlatforms', pages: [{ href: '/admin/marketing/ad-platforms', perm: 'marketing.campaigns.read', keys: ['marketingAdPlatforms', 'marketingAdGrowth', 'marketingAdBriefs', 'marketingAdCampaigns', 'marketingAdGuardrails'] }] },
      // S13 · PR 257: server-side event tracking (the ad platforms' server APIs; mocks until their keys are in).
      { id: 'tracking', pages: [{ href: '/admin/marketing/tracking', perm: 'ads.tracking.read', keys: ['adsTracking'] }] },
      // S13 · PR 254 (MKT-05): landing pages for ads — the list and the builder (`/admin/marketing/landing/<id>`, `new`);
      // PR 255: the templates and the parts library (`/admin/marketing/landing/templates`).
      // S12 · PR 246: the permanent seasonal pages (Eid, winter, Puja) — the list and the editor
      // (`/admin/marketing/landing/seasonal/<id>`, `new`).
      {
        id: 'landing',
        pages: [
          { href: '/admin/marketing/landing', perm: 'marketing.landing.read', keys: ['marketingLanding', 'marketingLandingPage', 'marketingLandingTemplates'] },
          { href: '/admin/marketing/landing/seasonal', perm: 'marketing.landing.read', keys: ['marketingSeasonal', 'marketingSeasonalPage'] },
          // PR 530: the yearly return — the ticks, the switch card and the occasions' dates.
          { href: '/admin/marketing/landing/seasonal/yearly', perm: 'marketing.landing.read', keys: ['marketingSeasonalYearly'] },
        ],
      },
      // S23 · PR 437, 438: the social & content studio — accounts, the brand asset library and templates.
      // S25 · PR 481 (Blueprint C8.1) adds the motion library sub-page (image-to-video jobs, reels, exports and the
      // creative brief join as the rest of PR 482–490 build).
      // S24 · PR 445 (Blueprint C7.21 "share … the model library") adds the model library sub-page (model profiles,
      // their own reference photos per angle, and their rights/consent records); one shared Studio tab, hidden while
      // any of `stages.closedShown.S23`, `.S24` or `.S25` is still off.
      // S25 · PR 489 (Blueprint C8.3) adds campaign overlays: a page-level, time-bound decoration on the product
      // card, listing and product page — never stored on the photo, never touching a price.
      {
        id: 'studio',
        pages: [
          { href: '/admin/marketing/studio', perm: 'studio.read', keys: ['marketingStudio'] },
          { href: '/admin/marketing/studio/motion', perm: 'marketing.studio.read', keys: ['marketingStudioMotion'] },
          { href: '/admin/marketing/studio/models', perm: 'photoshoot.read', keys: ['marketingStudioModels'] },
          { href: '/admin/marketing/studio/videos', perm: 'marketing.studio.read', keys: ['marketingStudioVideos'] },
          // S25 · PR 485/486: reel assembly — builds a reel's own recipe from approved clips, then assembles it
          // (the honest-preview compositor, one output per chosen shape).
          { href: '/admin/marketing/studio/reels', perm: 'marketing.studio.read', keys: ['marketingStudioReels'] },
          // S25 · PR 487: campaign creative export, part 1 — requests an export from a real product, SKU or
          // category that already has an approved image/video; producing the sized files is PR 488.
          { href: '/admin/marketing/studio/export', perm: 'marketing.studio.read', keys: ['marketingStudioExport'] },
          // S25 · PR 490: the creative brief — a few short questions, then three proposed directions to pick from.
          { href: '/admin/marketing/studio/briefs', perm: 'marketing.studio.read', keys: ['marketingStudioBriefs'] },
          { href: '/admin/marketing/studio/overlay', perm: 'marketing.studio.read', keys: ['marketingStudioOverlay'] },
        ],
      },
      // S13 · PR 273: referrals — the programme, friends' orders with their invite codes and the sharers' rewards.
      { id: 'referrals', pages: [{ href: '/admin/marketing/referrals', perm: 'marketing.campaigns.read', keys: ['marketingReferrals'] }] },
      // S13 · PR 278: YouTube — the channel, the videos with their products and tracked links, the orders they brought.
      { id: 'youtube', pages: [{ href: '/admin/marketing/youtube', perm: 'marketing.campaigns.read', keys: ['marketingYoutube'] }] },
      // S13 · PR 279: SEO outreach — the websites asked for a link, along the pipeline, with follow-up days and live links.
      { id: 'outreach', pages: [{ href: '/admin/marketing/outreach', perm: 'marketing.campaigns.read', keys: ['marketingOutreach'] }] },
      // S13 · PR 280: Seasonal home — saved home-page looks and the windows they show in (the home page switches by itself).
      { id: 'seasonal', pages: [{ href: '/admin/marketing/seasonal', perm: 'marketing.campaigns.read', keys: ['marketingSeasonalHome'] }] },
      // S13 · PR 281: Festive cut-off — where the live festive Smart Rules' last-order words show on the shop.
      { id: 'festive', pages: [{ href: '/admin/marketing/festive', perm: 'marketing.campaigns.read', keys: ['marketingFestive'] }] },
      // S13 · PR 282: the marketing calendar — campaigns, ads, sends, seasonal home, festive cut-offs, blog, social and the owner's plan lines (More options).
      { id: 'calendar', more: true, pages: [{ href: '/admin/marketing/calendar', perm: 'marketing.campaigns.read', keys: ['marketingCalendar'] }] },
      // S13 · PR 283: the marketing report — spend against Ordered value and Sales by channel, by campaign and per message send (More options).
      { id: 'report', more: true, pages: [{ href: '/admin/marketing/report', perm: 'marketing.campaigns.read', keys: ['marketingReport'] }] },
      // S13 · PR 569: where to advertise — each district's delivered and returned orders and its word (advice only; More options).
      { id: 'geoGuide', more: true, pages: [{ href: '/admin/marketing/geo-guide', perm: 'marketing.campaigns.read', keys: ['marketingGeoGuide'] }] },
      // S13 · PR 589: the Google Merchant Center product feed — address, counts, left-out reasons, the Bangladesh test (More options).
      { id: 'merchantFeed', more: true, pages: [{ href: '/admin/marketing/merchant-feed', perm: 'marketing.campaigns.read', keys: ['marketingMerchantFeed'] }] },
      // S13 · PR 548: Market & competitors — the owner's own followed shops, the price table against ours, change alerts (More options).
      { id: 'intel', more: true, pages: [{ href: '/admin/marketing/intel', perm: 'marketing.campaigns.read', keys: ['marketingIntel'] }] },
    ],
  },
  // S11 · PR 220–222: Website → SEO (search engines, titles and descriptions, the structured data). The site builder,
  // page layouts, blog and words join with their PRs.
  {
    id: 'website',
    icon: 'globe',
    group: 'grow',
    base: '/admin/website',
    guide: 'site',
    // PR 235: Redirects & 404 is the SEO tab's second page (demo WEB-04a). PR 227: Collection pages is the third.
    tabs: [
      // S02 · PR 76 (WEB-02) — Page layouts: each shop page's sections, their order, show / hide and screens.
      { id: 'layouts', pages: [{ href: '/admin/website/layouts', perm: 'website.read', keys: ['websiteLayouts'] }] },
      // S02 · PR 78 (WEB-05) — Words & language: every word the shop shows, in English and Bengali, with the owner's own.
      { id: 'words', pages: [{ href: '/admin/website/words', perm: 'website.read', keys: ['websiteWords'] }] },
      // S02 · PR 81 (WEB-06) — Eye-toggles: every part of a shop page that can be shown or hidden, in one searchable list.
      { id: 'eye', more: true, pages: [{ href: '/admin/website/eye-toggles', perm: 'website.read', keys: ['websiteEyeToggles'] }] },
      { id: 'canvas', more: true, pages: [{ href: '/admin/website/side-canvas', perm: 'website.read', keys: ['websiteSideCanvas'] }] },
      // S02 · PR 597 (WEB-07) — Launch default: save the whole shop look, restore it or a named look, undo a restore.
      { id: 'launch', more: true, pages: [{ href: '/admin/website/launch-default', perm: 'website.read', keys: ['websiteLaunchDefault'] }] },
      // S02 · PR 600 — On-page edit: the owner's bar on the shop (off as shipped), phone checks and the phone screens.
      { id: 'pageEdit', more: true, pages: [{ href: '/admin/website/page-edit', perm: 'website.read', keys: ['websitePageEdit'] }] },
      {
        id: 'seo',
        guide: 'seo',
        pages: [
          { href: '/admin/website/seo', perm: 'seo.read', keys: ['seo'] },
          { href: '/admin/website/seo/redirects', perm: 'seo.read', keys: ['seoRedirects'] },
          { href: '/admin/website/seo/categories', perm: 'seo.read', keys: ['seoCategories'] },
          // S11 · PR 588 — the Bengali translation gate: the coverage report and the pages marked ready.
          { href: '/admin/website/seo/bengali', perm: 'seo.read', keys: ['seoBengali'] },
          // S11 · PR 237 — SEO health: what is missing, page by page.
          { href: '/admin/website/seo/health', perm: 'seo.read', keys: ['seoHealth'] },
          // S11 · PR 238 — the organic report: Sales from search, video and AI assistants; clicks and positions.
          { href: '/admin/website/seo/organic', perm: 'seo.read', keys: ['seoOrganic'] },
        ],
      },
      // S12 · PR 240 (WEB-03) — Blog & journal: the board and the article editor (`/admin/website/blog/<id>`, `new`), and
      // the categories and authors.
      {
        id: 'blog',
        pages: [
          { href: '/admin/website/blog', perm: 'blog.read', keys: ['blog', 'blogPost', 'blogPhoto'] },
          { href: '/admin/website/blog/shelves', perm: 'blog.read', keys: ['blogShelves'] },
          // S12 · PR 242 — the topic plan: clusters (pillar + supporting articles), planned topics, required links.
          // PR 528 — a topic's brief (`/admin/website/blog/briefs/<id>`, `new`) belongs to the topic plan.
          { href: '/admin/website/blog/plan', perm: 'blog.read', keys: ['blogPlan', 'blogBrief'] },
          // S12 · PR 245 — the publish calendar: the days ahead, the month, the finished articles waiting for a time.
          { href: '/admin/website/blog/calendar', perm: 'blog.read', keys: ['blogCalendar'] },
          // S12 · PR 250 — content performance: each article's readers and the orders that read it (Sales and Ordered value).
          { href: '/admin/website/blog/performance', perm: 'blog.read', keys: ['blogPerformance'] },
          // S12 · PR 251 — readers' comments: the waiting queue, Show / Hide, the card (off = the journal without comments).
          { href: '/admin/website/blog/comments', perm: 'blog.read', keys: ['blogComments'] },
          // S12 · PR 252 — the shared calendar: articles beside plans, campaigns and cut-offs (social while S23 is shown).
          { href: '/admin/website/blog/shared', perm: 'blog.read', keys: ['blogShared'] },
          // S12 · PR 253 — what articles sold: the products bought after reading each article (its own or besides).
          { href: '/admin/website/blog/sold', perm: 'blog.read', keys: ['blogSold'] },
          // S12 · PR 592 — house ads: our own offers in the journal's places (`/admin/website/blog/ads/<id>`, `new`), clicks and orders.
          { href: '/admin/website/blog/ads', perm: 'blog.read', keys: ['blogAds', 'blogAd'] },
          // S12 · PR 591 — the content pipeline: the pace (3 a day, then 5 while healthy), the queue, review and refresh.
          { href: '/admin/website/blog/pipeline', perm: 'blog.read', keys: ['blogPipeline'] },
          // S12 · PR 529 — write from a link: give it a link to an article anywhere, it researches and writes an original draft.
          { href: '/admin/website/blog/source', perm: 'blog.read', keys: ['blogSource'] },
        ],
      },
    ],
  },
  // CN-028 · PR 615, 616: Books — Retail's ERP account, the books match, the differences and the closes.
  // CN-028 · PR 617 (CN-029): Money → Daily summary — the Books status card and the daily summaries sent to the ERP.
  // PR 618: Money → Costs — the month's fixed costs and the daily cost lines.
  {
    id: 'money',
    icon: 'wallet',
    group: 'business',
    base: '/admin/money',
    guide: 'finance',
    // S28 · PR 688 (admin prototype v5): Money is the prototype's Finance, seven tabs — Overview, Money in & out, Profit & loss,
    // Costs & budgets, ERP account, Wallet & refunds, VAT (shown only while the VAT system is on: `vat.system`, off as shipped;
    // lib/stages/closed.ts). The Couriers tab (PR 670) sits beside Wallet & refunds. Every page that was a tab is a page of one of them.
    tabs: [
      // S16 · PR 342: Money → Overview — cash received, COD the couriers owe, refunds waiting (read-only).
      { id: 'overview', pages: [{ href: '/admin/money', perm: 'payments.view', keys: ['moneyOverview'] }] },
      // S28 · PR 687: Money → Money in & out — the cashbook and the cash forecast (the owner's PIN for every entry).
      { id: 'cash', pages: [{ href: '/admin/money/cash', perm: 'books.read', keys: ['moneyCash'] }] },
      // S16 · PR 349: Profit & loss (MNY-01) — Sales beside Ordered value, gross profit, contribution, net profit for any period.
      // S16 · PR 504: its second page, Profit by group; PR 355: its third, Profit by channel.
      {
        id: 'profit',
        pages: [
          { href: '/admin/money/profit', perm: 'books.read', keys: ['moneyProfit'] },
          { href: '/admin/money/profit/groups', perm: 'books.read', keys: ['moneyProfitGroups'] },
          { href: '/admin/money/profit/channels', perm: 'books.read', keys: ['moneyProfitChannels'] },
        ],
      },
      // Costs & budgets: S28 · PR 688 budgets and profit snapshot; PR 618 costs; S16 · PR 344 expenses; PR 345 costs & fees;
      // PR 343 the cost ledger and PR 347 its report.
      {
        id: 'costs',
        pages: [
          { href: '/admin/money/budgets', perm: 'books.read', keys: ['moneyBudgets'] },
          { href: '/admin/money/costs', perm: 'books.read', keys: ['moneyCosts'] },
          { href: '/admin/money/expenses', perm: 'books.read', keys: ['moneyExpenses'] },
          { href: '/admin/money/fees', perm: 'books.read', keys: ['moneyFees'] },
          { href: '/admin/money/cost-ledger', perm: 'books.read', keys: ['moneyCostLedger'] },
          { href: '/admin/money/cost-ledger/report', perm: 'books.read', keys: ['moneyCostReport'] },
        ],
      },
      // ERP account: CN-028 · PR 615, 616 Books (Retail's ERP account), the match, the differences and the closes; PR 617 the
      // daily summaries; S16 · PR 346 the month-end close sheet.
      {
        id: 'erp',
        pages: [
          { href: '/admin/money/books', perm: 'erp.account.read', keys: ['booksAccount'] },
          { href: '/admin/money/books/match', perm: 'books.read', keys: ['booksMatch'] },
          { href: '/admin/money/books/differences', perm: 'books.read', keys: ['booksDifferences'] },
          { href: '/admin/money/books/closes', perm: 'books.read', keys: ['booksCloses'] },
          { href: '/admin/money/books/daily', perm: 'books.read', keys: ['booksDaily'] },
          { href: '/admin/money/month-end', perm: 'books.read', keys: ['moneyMonthEnd'] },
        ],
      },
      // Go-live gate F-041 / F-054: Wallet & refunds — approve and record refunds, the apology credit, the money rules.
      { id: 'refunds', pages: [{ href: '/admin/money/refunds', perm: 'payments.view', keys: ['moneyRefunds'] }] },
      // S28 · PR 670: Courier 360's Money section, reachable from Finance (it opens the default courier's money).
      { id: 'couriers', pages: [{ href: '/admin/money/couriers', perm: 'payments.view', keys: ['moneyCouriers'] }] },
      // S16 · PR 350: VAT — the system's switch (off) and the owner's rates; the tab shows only while the system is on.
      { id: 'vat', pages: [{ href: '/admin/money/vat', perm: 'books.read', keys: ['moneyVat'] }] },
    ],
  },
  {
    id: 'reports',
    icon: 'chart',
    group: 'business',
    base: '/admin/reports',
    guide: 'analytics',
    // S21 · PR 413 — REP-07 the Site health hub first; the Server page (REP-07b) beside it.
    tabs: [
      // S28 · PR 689: Reports → Report library first (the prototype opens Reports on it); PR 690: Report packs beside it.
      { id: 'library', guide: 'analytics', pages: [{ href: '/admin/reports', perm: 'reports.read', keys: ['reportsLibrary'] }] },
      { id: 'packs', guide: 'analytics', pages: [{ href: '/admin/reports/packs', perm: 'reports.read', keys: ['reportsPacks'] }] },
      {
        id: 'health',
        guide: 'server',
        pages: [
          { href: '/admin/reports/health', perm: 'health.read', keys: ['health'] },
          // S21 · PR 423 — REP-07c Customer problems (CN-015): what went wrong for visitors, found from real visits.
          { href: '/admin/reports/health/problems', perm: 'health.read', keys: ['healthProblems'] },
          // S21 · PR 417 — REP-07c Speed: month by month against the targets, the lab run and "Measure now".
          { href: '/admin/reports/health/speed', perm: 'health.read', keys: ['healthSpeed'] },
          // S21 · PR 418 — REP-07e Smoke runs: the newest run after a deploy and at night, page by page with pictures.
          { href: '/admin/reports/health/smoke', perm: 'health.read', keys: ['healthSmoke'] },
          // S21 · PR 419 — B7.3 Run history: every smoke test and journeys run with its findings, kept for comparison.
          { href: '/admin/reports/health/history', perm: 'health.read', keys: ['healthHistory'] },
          // S21 · PR 420 — B7.3 Fixes to approve: agents' proposed fixes and new skills wait for the owner's OK.
          { href: '/admin/reports/health/fixes', perm: 'health.read', keys: ['healthFixes'] },
          { href: '/admin/server', perm: 'system.read', keys: ['server'] },
        ],
      },
      // S06 · PR 164 — Fraud & RTO: what the risk steps caught, what was wrong, the cost probably saved, the RTO cost book.
      {
        id: 'fraud',
        guide: 'analytics',
        pages: [{ href: '/admin/reports/fraud', perm: 'risk.report', keys: ['reportsFraud'] }],
      },
      // S06 · PR 524 — Stopped by the engine: every order the engine stopped by itself, its rule and what became of it.
      {
        id: 'stopped',
        guide: 'analytics',
        pages: [{ href: '/admin/reports/stopped', perm: 'risk.report', keys: ['reportsStopped'] }],
      },
      // S06 · PR 543 — Decisions & learning: the team's decisions on the engine's stops, per rule and per person, and what they suggest.
      {
        id: 'learning',
        guide: 'analytics',
        pages: [{ href: '/admin/reports/learning', perm: 'risk.report', keys: ['reportsLearning'] }],
      },
      // S08 · PR 192 — REP-05 Delivery & RTO: courier performance by courier, zone and district, late parcels, RTO cost book.
      { id: 'delivery', pages: [{ href: '/admin/reports/delivery', perm: 'reports.read', keys: ['reportsDelivery'] }] },
      // S28 · PR 670: Courier 360's Performance section, reachable from Reports (it opens the default courier's performance)
      { id: 'couriers', guide: 'analytics', pages: [{ href: '/admin/reports/couriers', perm: 'reports.read', keys: ['reportsCouriers'] }] },
      // S14 · PR 303 — REP-04 Customers: new, returning and quiet (churned) buyers over a period, overall and per saved segment.
      { id: 'customers', guide: 'analytics', pages: [{ href: '/admin/reports/customers', perm: 'reports.read', keys: ['reportsCustomers'] }] },
      // S06 · PR 562 — Flag outcomes: of the customers asked to pay ahead, how many paid and how many walked away, per layer.
      {
        id: 'flags',
        guide: 'analytics',
        pages: [{ href: '/admin/reports/flags', perm: 'risk.report', keys: ['reportsFlags'] }],
      },
      // S16 · PR 352: Reports → Team — what each person did in the week or month, with badges (off as shipped).
      { id: 'team', pages: [{ href: '/admin/reports/team', perm: 'staff.performance', keys: ['reportsTeam'] }] },
      // S16 · PR 568: Reports → Sales by area — REP-02's area part: district, upazila/thana or inside Dhaka, with returns.
      { id: 'areas', pages: [{ href: '/admin/reports/areas', perm: 'books.read', keys: ['reportsAreas'] }] },
      // S05 · PR 155 follow-up 91 — Orders: Ordered value and Sales by day, by delivery zone and by payment method (CN-019).
      { id: 'orders', guide: 'analytics', pages: [{ href: '/admin/reports/orders', perm: 'books.read', keys: ['reportsOrders'] }] },
      // S02 · PR 72 follow-up 100 — Searches: what shoppers searched for and what found nothing (`search.insights`, off).
      { id: 'searches', more: true, guide: 'analytics', pages: [{ href: '/admin/reports/searches', perm: 'reports.read', keys: ['reportsSearches'] }] },
      // S02 · PR 83 — REP-08 Experiments: A/B tests of the shop's words and shown or hidden parts, with how sure each result is.
      { id: 'experiments', more: true, guide: 'analytics', pages: [{ href: '/admin/reports/experiments', perm: 'reports.experiments.read', keys: ['reportsExperiments', 'reportsExperiment'] }] },
      // S15 · PR 340 (Blueprint D5.2 "a funnel per product"; REP-10) — Funnels: per-step visitor counts and the
      // conversion from one step to the next, read from the PR 338/339 event and funnel layer. Seeing only
      // (`reports.read`); creating the one-click "shop funnel" default needs `reports.analytics.write`.
      { id: 'funnels', more: true, guide: 'analytics', pages: [{ href: '/admin/reports/funnels', perm: 'reports.read', keys: ['reportsFunnels'] }] },
    ],
  },
  {
    id: 'ai',
    icon: 'spark',
    group: 'business',
    base: '/admin/ai',
    tabs: [
      // S15 · PR 304 (C1.1, C1.2; AIC-01) — Control room: every agent, what it did last, today's and this month's
      // cost, and a pause button per agent (the master switch itself joins with PR 305).
      { id: 'control', guide: 'ai', pages: [{ href: '/admin/ai', perm: 'ai.read', keys: ['aiControl'] }] },
      // S15 · PR 580 (C2.4) — Model picks: a suggested model per job, free models qualified like paid ones, with
      // their own quality score, cost and a "Re-test now" (owner only; off by default behind its own switch).
      { id: 'models', guide: 'ai', pages: [{ href: '/admin/ai/models', perm: 'ai.read', keys: ['aiModels'] }] },
      // S15 · PR 577 (C10.4) — Agents: the team grid and each fixed agent's own 360° profile.
      { id: 'agents', guide: 'ai', pages: [{ href: '/admin/agents', perm: 'ai.read', keys: ['aiAgents'] }] },
      // S15 · PR 583 (C10.2) — Ask the chief: the chain of command, the chief's own investigations and the chief's
      // own row of the PR 318 permission matrix (owner reads it here; changes any cell through Permissions too).
      { id: 'agentsChief', guide: 'ai', pages: [{ href: '/admin/agents/chief', perm: 'ai.read', keys: ['aiAgentsChief'] }] },
      // S21 · PR 570 — B7.3 / AIC-05 Checklist audit: the e-commerce checklist in the backend and its runner (owner only).
      { id: 'audit', guide: 'ai', pages: [{ href: '/admin/ai/audit', perm: 'health.read', keys: ['aiAudit'] }] },
      // S15 · PR 312 (C2.1, C2.2) — Cost Book: every AI job, its recommended model and why, its estimated cost, and
      // a model selector right in the row (owner only).
      { id: 'costBook', guide: 'ai', pages: [{ href: '/admin/ai/cost-book', perm: 'ai.read', keys: ['aiCostBook'] }] },
      // S15 · PR 317 (C3.2) — Approvals: the single queue for everything an agent wants to do but may not do alone
      // (money, refunds, COD, prices, discounts, ad budget, blocking, deletion, skills, fixes), cleared in one pass.
      { id: 'approvals', guide: 'ai', pages: [{ href: '/admin/ai/approvals', perm: 'ai.read', keys: ['aiApprovals'] }] },
      // S15 · PR 318 (C3.2) — Permissions: the permission matrix — per agent, what it may decide alone, must only
      // propose, or may not touch at all, over orders/stock/prices/courier/money/customer data/code (owner only).
      { id: 'permissions', guide: 'ai', pages: [{ href: '/admin/ai/permissions', perm: 'ai.read', keys: ['aiPermissions'] }] },
      // S15 · PR 319 (C1.7) — AI diary: a plain-Bengali line per agent per action, what it did, why, and what it
      // changed — not a technical log (owner only).
      { id: 'diary', guide: 'ai', pages: [{ href: '/admin/ai/diary', perm: 'ai.read', keys: ['aiDiary'] }] },
      // S15 · PR 321 (C1.7 "Skill library") — every AiSkill as a card: name, agent, version, status, on/off; the
      // owner's own "Import a skill" and one-click rollback (owner only).
      // S15 · PR 322 adds the Sandbox sub-page (`/admin/ai/skills/sandbox`) beside the Library, matching the
      // demo's own `A2B_SKSUB` two-page nav (AIC-04/04a).
      {
        id: 'skills',
        guide: 'ai',
        pages: [
          { href: '/admin/ai/skills', perm: 'ai.read', keys: ['aiSkills'] },
          { href: '/admin/ai/skills/sandbox', perm: 'ai.read', keys: ['aiSkillsSandbox'] },
        ],
      },
      // S15 · PR 578 (C10.4) — Agent reports: daily/weekly/monthly/yearly reports per agent, on demand.
      { id: 'reports', guide: 'ai', pages: [{ href: '/admin/ai/reports', perm: 'ai.read', keys: ['aiReports'] }] },
      // S15 · PR 585 — Learning engine: Tirondaj/Doot's own research → quality gate → skill basket loop, practice
      // tasks and paid-tool proposals (owner only).
      { id: 'learning', guide: 'ai', pages: [{ href: '/admin/ai/learning', perm: 'ai.read', keys: ['aiLearning'] }] },
    ],
    ownerOnly: true,
    guide: 'ai',
  },
  {
    id: 'settings',
    icon: 'sliders',
    group: 'bottom',
    base: '/admin/settings',
    guide: 'settings',
    tabs: [
      // S18 · PR 383 — SET-01 Store details: the legal numbers (name, logo, contacts and social links join with their PR).
      { id: 'store', guide: 'settings', pages: [{ href: '/admin/settings/store', perm: 'settings.read', keys: ['store'] }] },
      // S18 · PR 384 — SET-03 Policies & texts: the help pages' switches, rules and the owner's words.
      { id: 'policies', guide: 'settings', pages: [{ href: '/admin/settings/policies', perm: 'settings.read', keys: ['policies'] }] },
      // S28 · PR 706 (CN-049) — Practice data: the switch, the sample data and the reset (owner only inside the page).
      { id: 'practice', guide: 'settings', pages: [{ href: '/admin/settings/practice', perm: 'settings.write', keys: ['practice'] }] },
      { id: 'keys', guide: 'integrations', pages: [{ href: '/admin/integrations', perm: 'vault.read', keys: ['integrations'] }] },
      // CN-029 · PR 619: Settings → ERP link — one store's own ERP link, its keys, the switch-over to contract v6.
      { id: 'erp', guide: 'integrations', pages: [{ href: '/admin/settings/erp-link', perm: 'vault.read', keys: ['erpLink'] }] },
      // S18 · PR 380 — SET-04d Sign-in & security (Team & roles' security page; People and Roles join with their PRs).
      // S18 · PR 386 — Cloudflare protection, the security tab's second page.
      { id: 'security', guide: 'settings', pages: [{ href: '/admin/settings/security', perm: 'security.read', keys: ['security'] }, { href: '/admin/settings/security/edge', perm: 'security.read', keys: ['edge'] }] },
      // S18 · PR 382 — SET-08d Privacy & data (the IP/GPS keeping period and its clean-up, customers' erasure requests).
      { id: 'privacy', guide: 'settings', pages: [{ href: '/admin/settings/privacy', perm: 'security.read', keys: ['privacy'] }] },
      // S02 · PR 602 — SET-08b Cache (System); S19 · PR 395 (CN-030) — Backups (the one-click Google Drive); Images,
      // Data purge join with their PRs.
      {
        id: 'system',
        guide: 'cache',
        pages: [
          { href: '/admin/settings/system/cache', perm: 'system.read', keys: ['cache'] },
          { href: '/admin/settings/system/backups', perm: 'system.read', keys: ['backups'] },
          // S19 · PR 393 (CN-031) — the go-live checklist.
          { href: '/admin/settings/system/go-live', perm: 'system.read', keys: ['golive'] },
        ],
      },
      // S02 · PR 598 — Settings › More › Shimmer: every shimmer's switch, speed and strength (demo 89t-shimmer.js).
      { id: 'shimmer', more: true, guide: 'settings', pages: [{ href: '/admin/settings/shimmer', perm: 'settings.read', keys: ['settingsShimmer'] }] },
      // PR 495 (12) follow-up 205 — Settings › More › Start & search: start page per role, the search box, the Dashboard.
      { id: 'shell', more: true, guide: 'settings', pages: [{ href: '/admin/settings/shell', perm: 'settings.read', keys: ['settingsShell'] }] },
      // PR 12 (CN-025): Settings → Admin look (the page designs, where the guide opens).
      { id: 'look', guide: 'admin-look', pages: [{ href: '/admin/settings/look', perm: 'settings.read', keys: ['adminLook'] }] },
    ],
  },
  {
    id: 'help',
    icon: 'help',
    group: 'bottom',
    base: '/admin/help',
    guide: 'README',
    tabs: [
      { id: 'manual', pages: [{ href: '/admin/help', perm: 'help.read', keys: ['help'] }] },
      // S18 · PR 387 (B7.5, HLP-01) — the Site manual: every section as a chapter, every page guide in it.
      { id: 'book', pages: [{ href: '/admin/help/manual', perm: 'help.read', keys: ['manual'] }] },
      // S21 · PR 594 (HLP-02): Build progress (owner) — every stage and PR from the register with its card, the problems
      // reported on PRs, and the blueprint and every docs file (read, search, download, earlier versions).
      { id: 'build', pages: [{ href: '/admin/build', perm: 'build.read', keys: ['build', 'buildPr'] }] },
      { id: 'problems', pages: [{ href: '/admin/build/problems', perm: 'build.read', keys: ['buildProblems'] }] },
      { id: 'files', pages: [{ href: '/admin/build/files', perm: 'build.read', keys: ['buildFiles', 'buildFile'] }] },
      // S02 · PR 599 — Feature requests: "request a feature" into the PR register flow (never a code edit).
      { id: 'requests', pages: [{ href: '/admin/build/requests', perm: 'build.read', keys: ['buildRequests'] }] },
    ],
  },
];

export const SHELL_SECTIONS: readonly ShellSection[] = RAW_SECTIONS.map((s) => applyNavV5(s));

/** What the person may see: their keys in the current store and whether they are an owner. */
export interface ShellViewer {
  perms: ReadonlySet<string>;
  owner: boolean;
  /**
   * S19 · PR 652: the parts of the closed stages hidden by their switch (lib/stages/closed.ts): section ids and
   * `<section>.<tab>` ids, hidden from everyone, the owner too (the menu, the admin search, the manual, start pages).
   */
  hidden?: ReadonlySet<string>;
}

export const sectionById = (id: string) => SHELL_SECTIONS.find((s) => s.id === id) ?? null;

const pageVisible = (p: ShellPage, v: ShellViewer) => v.owner || v.perms.has(p.perm);

/** A tab's pages the person may open (the first is where the tab leads). */
export const visiblePages = (t: ShellTab, v: ShellViewer) => t.pages.filter((p) => pageVisible(p, v));

export const visibleTabs = (s: ShellSection, v: ShellViewer) => s.tabs.filter((t) => !v.hidden?.has(`${s.id}.${t.id}`) && visiblePages(t, v).length > 0);

/** A menu entry shows only to someone who holds a key in it (§5.0); a section with no key yet, to the owner. */
export function sectionVisible(s: ShellSection, v: ShellViewer): boolean {
  if (s.folded || v.hidden?.has(s.id)) return false;
  if (v.owner) return true;
  if (s.ownerOnly) return false;
  if (s.perms?.some((k) => v.perms.has(k))) return true;
  return visibleTabs(s, v).length > 0;
}

/** Where the sidebar entry leads: the Dashboard itself (no start-page jump), the first built tab, or the placeholder. */
export function sectionHome(s: ShellSection, v: ShellViewer): string {
  if (s.id === 'dashboard') return '/admin?home=1';
  const t = visibleTabs(s, v)[0];
  return t ? visiblePages(t, v)[0]!.href : s.base;
}

export interface ShellPlace {
  section: ShellSection;
  tab: ShellTab | null;
  page: ShellPage | null;
}

const owns = (href: string, path: string) => path === href || path.startsWith(`${href}/`);

/** The section, tab and page an address belongs to: the longest page address that owns it, else a section base. */
export function locate(pathname: string): ShellPlace | null {
  const path = pathname.replace(/\/+$/, '') || '/admin';
  let best: ShellPlace | null = null;
  let len = -1;
  for (const section of SHELL_SECTIONS) {
    for (const tab of section.tabs) {
      for (const page of tab.pages) {
        if (owns(page.href, path) && page.href.length > len) {
          best = { section, tab, page };
          len = page.href.length;
        }
      }
    }
  }
  if (best) return best;
  for (const section of SHELL_SECTIONS) {
    if (section.base !== '/admin' && owns(section.base, path)) return { section, tab: null, page: null };
  }
  return path === '/admin' ? { section: SHELL_SECTIONS[0]!, tab: null, page: null } : null;
}

/** The place of a page by the key it passes to the frame (`current`). */
export function locateKey(key: string): ShellPlace | null {
  for (const section of SHELL_SECTIONS) {
    for (const tab of section.tabs) {
      const page = tab.pages.find((p) => p.keys.includes(key));
      if (page) return { section, tab, page };
    }
  }
  return null;
}

/** The guide of a place: its tab's own, else its section's. */
export const guideOf = (p: ShellPlace) => p.tab?.guide ?? p.section.guide;

/** Every guide a section or tab names (each must exist in docs/admin-guide/; the tests check). */
export const GUIDE_SLUGS: readonly string[] = [...new Set(SHELL_SECTIONS.flatMap((s) => [s.guide, ...s.tabs.flatMap((t) => (t.guide ? [t.guide] : []))]))];

/** Sections whose placeholder is drawn at their base address (no built page lives there). */
export const placeholderSections = () => SHELL_SECTIONS.filter((s) => !s.folded && s.base !== '/admin' && !s.tabs.some((t) => t.pages.some((p) => p.href === s.base)));
