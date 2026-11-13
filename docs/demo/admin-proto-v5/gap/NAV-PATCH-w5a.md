# NAV PATCH, wave 5a (PR 692-699)

The pages below are built and work at their routes, but they are NOT yet in `sections.ts`, `lumen-nav.ts` or `admin-shell.*.json` (those files belong to the coordinator). Until they are added, each page's `locateKey(KEY)` returns null (no breadcrumb place) and no menu entry shows. Add one menu entry per row, with the key as the item key, and give it an icon.

| Key | Route | Menu place | See with | Notes |
|---|---|---|---|---|
| supportReplies | /admin/support/replies | Inbox > Quick replies | support.read (as the page) | PR 692 |
| supportComments | /admin/support/comments | Inbox > Comments | as the page | PR 693 |
| supportCommentsLive | /admin/support/comments/live | Inbox > Comments > Live selling (a tab on Comments) | as the page | PR 694 |
| marketingAffiliates | /admin/marketing/affiliates | Marketing > Tools > Influencers & affiliates | marketing.campaigns.read | PR 695; Pay needs payments.record and stays off (owner decision, item 7) |
| marketingMetaFeed | /admin/marketing/meta-feed | Marketing > Tools > Shopping feed (beside Google feed) | marketing.campaigns.read | PR 696; the feed itself is /feeds/meta.xml |
| marketingMessageCampaigns | /admin/marketing/message-campaigns | Marketing > Message campaigns | messages.journey.read | PR 697 |
| messagesCostCeilings | /admin/messages/cost-ceilings | Messages > Cost ceilings | as the page | PR 698; also a read-only card on /admin/ai/cost-book |
| marketingOverview | /admin/marketing/overview | Marketing > Overview (first item) | marketing.campaigns.read | PR 699; `?days=7|30|90` |
| marketingPlan | /admin/marketing/plan | Marketing > Plan & ideas | marketing.campaigns.read | PR 699 |

The Ad campaigns table is on the Overview page (a section, not a separate route).

## Settings groups (registry-w5a.ts, versions 360-369)
Already registered, with English and Bengali labels in `packages/settings/messages/w5a.*.json`: support.savedReplies, support.commentDesk, support.liveSelling, marketing.affiliates, messages.costCeiling, marketing.verdicts, marketing.metaFeed. All off or advice-only as shipped. No new permission keys were added.

## Help
`apps/web/src/lib/admin-shell/help-pages.json` already has the guide rows for these pages (the guide check passes).

## Shared file touched
`packages/db/src/schema-meta.ts`: `AffiliatePayout` added to `APPEND_ONLY_LOCKED` (PR 695).
