// S02 · PR 78 follow-up (677, 6 Nov, lane B) — the admin's own words (messages/admin*.<lang>.json) for Website › Words
// & language, read only: every word of every admin file with its English and Bengali, searched and paged like the
// shop's words. Editing them stays out: each admin page merges its own file over the shell's at drawing time, so an
// owner's word could not reach every place it shows yet (a later PR can add it). The files are imported here one by
// one (a test keeps this list equal to the folder), so the list is part of the server bundle and needs no file reads.
// Pure: no database.
import type { Dict } from '../i18n';
import adminEn from '../../../messages/admin.en.json';
import adminBn from '../../../messages/admin.bn.json';
import adminAdPlatformsEn from '../../../messages/admin-ad-platforms.en.json';
import adminAdPlatformsBn from '../../../messages/admin-ad-platforms.bn.json';
import adminAdvanceEn from '../../../messages/admin-advance.en.json';
import adminAdvanceBn from '../../../messages/admin-advance.bn.json';
import adminAreasEn from '../../../messages/admin-areas.en.json';
import adminAreasBn from '../../../messages/admin-areas.bn.json';
import adminAudiencesEn from '../../../messages/admin-audiences.en.json';
import adminAudiencesBn from '../../../messages/admin-audiences.bn.json';
import adminBackupsEn from '../../../messages/admin-backups.en.json';
import adminBackupsBn from '../../../messages/admin-backups.bn.json';
import adminBagboxEn from '../../../messages/admin-bagbox.en.json';
import adminBagboxBn from '../../../messages/admin-bagbox.bn.json';
import adminBengaliEn from '../../../messages/admin-bengali.en.json';
import adminBengaliBn from '../../../messages/admin-bengali.bn.json';
import adminBlogEn from '../../../messages/admin-blog.en.json';
import adminBlogBn from '../../../messages/admin-blog.bn.json';
import adminBooksEn from '../../../messages/admin-books.en.json';
import adminBooksBn from '../../../messages/admin-books.bn.json';
import adminBooksDailyEn from '../../../messages/admin-books-daily.en.json';
import adminBooksDailyBn from '../../../messages/admin-books-daily.bn.json';
import adminBuildEn from '../../../messages/admin-build.en.json';
import adminBuildBn from '../../../messages/admin-build.bn.json';
import adminCacheEn from '../../../messages/admin-cache.en.json';
import adminCacheBn from '../../../messages/admin-cache.bn.json';
import adminCalendarEn from '../../../messages/admin-calendar.en.json';
import adminCalendarBn from '../../../messages/admin-calendar.bn.json';
import adminCallsEn from '../../../messages/admin-calls.en.json';
import adminCallsBn from '../../../messages/admin-calls.bn.json';
import adminCampaignsEn from '../../../messages/admin-campaigns.en.json';
import adminCampaignsBn from '../../../messages/admin-campaigns.bn.json';
import adminCanvasEn from '../../../messages/admin-canvas.en.json';
import adminCanvasBn from '../../../messages/admin-canvas.bn.json';
import adminCombosEn from '../../../messages/admin-combos.en.json';
import adminCombosBn from '../../../messages/admin-combos.bn.json';
import adminCostLedgerEn from '../../../messages/admin-cost-ledger.en.json';
import adminCostLedgerBn from '../../../messages/admin-cost-ledger.bn.json';
import adminCostReportEn from '../../../messages/admin-cost-report.en.json';
import adminCostReportBn from '../../../messages/admin-cost-report.bn.json';
import adminCostsEn from '../../../messages/admin-costs.en.json';
import adminCostsBn from '../../../messages/admin-costs.bn.json';
import adminCourierReportEn from '../../../messages/admin-courier-report.en.json';
import adminCourierReportBn from '../../../messages/admin-courier-report.bn.json';
import adminCustomersEn from '../../../messages/admin-customers.en.json';
import adminCustomersBn from '../../../messages/admin-customers.bn.json';
import adminDeliveryEn from '../../../messages/admin-delivery.en.json';
import adminDeliveryBn from '../../../messages/admin-delivery.bn.json';
import adminDigestEn from '../../../messages/admin-digest.en.json';
import adminDigestBn from '../../../messages/admin-digest.bn.json';
import adminEdgeEn from '../../../messages/admin-edge.en.json';
import adminEdgeBn from '../../../messages/admin-edge.bn.json';
import adminErpLinkEn from '../../../messages/admin-erp-link.en.json';
import adminErpLinkBn from '../../../messages/admin-erp-link.bn.json';
import adminErpOrdersEn from '../../../messages/admin-erp-orders.en.json';
import adminErpOrdersBn from '../../../messages/admin-erp-orders.bn.json';
import adminEtaEn from '../../../messages/admin-eta.en.json';
import adminEtaBn from '../../../messages/admin-eta.bn.json';
import adminExpensesEn from '../../../messages/admin-expenses.en.json';
import adminExpensesBn from '../../../messages/admin-expenses.bn.json';
import adminExperimentsEn from '../../../messages/admin-experiments.en.json';
import adminExperimentsBn from '../../../messages/admin-experiments.bn.json';
import adminEyeEn from '../../../messages/admin-eye.en.json';
import adminEyeBn from '../../../messages/admin-eye.bn.json';
import adminFeesEn from '../../../messages/admin-fees.en.json';
import adminFeesBn from '../../../messages/admin-fees.bn.json';
import adminFestiveEn from '../../../messages/admin-festive.en.json';
import adminFestiveBn from '../../../messages/admin-festive.bn.json';
import adminFlagsEn from '../../../messages/admin-flags.en.json';
import adminFlagsBn from '../../../messages/admin-flags.bn.json';
import adminFraudEn from '../../../messages/admin-fraud.en.json';
import adminFraudBn from '../../../messages/admin-fraud.bn.json';
import adminFulfilEn from '../../../messages/admin-fulfil.en.json';
import adminFulfilBn from '../../../messages/admin-fulfil.bn.json';
import adminGoliveEn from '../../../messages/admin-golive.en.json';
import adminGoliveBn from '../../../messages/admin-golive.bn.json';
import adminHealthEn from '../../../messages/admin-health.en.json';
import adminHealthBn from '../../../messages/admin-health.bn.json';
import adminInboxEn from '../../../messages/admin-inbox.en.json';
import adminInboxBn from '../../../messages/admin-inbox.bn.json';
import adminIncompleteEn from '../../../messages/admin-incomplete.en.json';
import adminIncompleteBn from '../../../messages/admin-incomplete.bn.json';
import adminInvoiceEn from '../../../messages/admin-invoice.en.json';
import adminInvoiceBn from '../../../messages/admin-invoice.bn.json';
import adminLandingEn from '../../../messages/admin-landing.en.json';
import adminLandingBn from '../../../messages/admin-landing.bn.json';
import adminLaunchEn from '../../../messages/admin-launch.en.json';
import adminLaunchBn from '../../../messages/admin-launch.bn.json';
import adminLayoutsEn from '../../../messages/admin-layouts.en.json';
import adminLayoutsBn from '../../../messages/admin-layouts.bn.json';
import adminLearningEn from '../../../messages/admin-learning.en.json';
import adminLearningBn from '../../../messages/admin-learning.bn.json';
import adminManualEn from '../../../messages/admin-manual.en.json';
import adminManualBn from '../../../messages/admin-manual.bn.json';
import adminMarketingReportEn from '../../../messages/admin-marketing-report.en.json';
import adminMarketingReportBn from '../../../messages/admin-marketing-report.bn.json';
import adminMarketingStudioEn from '../../../messages/admin-marketing-studio.en.json';
import adminMarketingStudioBn from '../../../messages/admin-marketing-studio.bn.json';
import adminMessagesEn from '../../../messages/admin-messages.en.json';
import adminMessagesBn from '../../../messages/admin-messages.bn.json';
import adminMoneyEn from '../../../messages/admin-money.en.json';
import adminMoneyBn from '../../../messages/admin-money.bn.json';
import adminMonthEndEn from '../../../messages/admin-month-end.en.json';
import adminMonthEndBn from '../../../messages/admin-month-end.bn.json';
import adminOrderProfitEn from '../../../messages/admin-order-profit.en.json';
import adminOrderProfitBn from '../../../messages/admin-order-profit.bn.json';
import adminOrderReportEn from '../../../messages/admin-order-report.en.json';
import adminOrderReportBn from '../../../messages/admin-order-report.bn.json';
import adminOrdersEn from '../../../messages/admin-orders.en.json';
import adminOrdersBn from '../../../messages/admin-orders.bn.json';
import adminOutreachEn from '../../../messages/admin-outreach.en.json';
import adminOutreachBn from '../../../messages/admin-outreach.bn.json';
import adminPageeditEn from '../../../messages/admin-pageedit.en.json';
import adminPageeditBn from '../../../messages/admin-pageedit.bn.json';
import adminPoliciesEn from '../../../messages/admin-policies.en.json';
import adminPoliciesBn from '../../../messages/admin-policies.bn.json';
import adminPrivacyEn from '../../../messages/admin-privacy.en.json';
import adminPrivacyBn from '../../../messages/admin-privacy.bn.json';
import adminProblemsEn from '../../../messages/admin-problems.en.json';
import adminProblemsBn from '../../../messages/admin-problems.bn.json';
import adminProductsEn from '../../../messages/admin-products.en.json';
import adminProductsBn from '../../../messages/admin-products.bn.json';
import adminProfitEn from '../../../messages/admin-profit.en.json';
import adminProfitBn from '../../../messages/admin-profit.bn.json';
import adminProfitChannelsEn from '../../../messages/admin-profit-channels.en.json';
import adminProfitChannelsBn from '../../../messages/admin-profit-channels.bn.json';
import adminProfitGroupsEn from '../../../messages/admin-profit-groups.en.json';
import adminProfitGroupsBn from '../../../messages/admin-profit-groups.bn.json';
import adminReferralsEn from '../../../messages/admin-referrals.en.json';
import adminReferralsBn from '../../../messages/admin-referrals.bn.json';
import adminRefundsEn from '../../../messages/admin-refunds.en.json';
import adminRefundsBn from '../../../messages/admin-refunds.bn.json';
import adminRequestsEn from '../../../messages/admin-requests.en.json';
import adminRequestsBn from '../../../messages/admin-requests.bn.json';
import adminReturnsEn from '../../../messages/admin-returns.en.json';
import adminReturnsBn from '../../../messages/admin-returns.bn.json';
import adminReviewsEn from '../../../messages/admin-reviews.en.json';
import adminReviewsBn from '../../../messages/admin-reviews.bn.json';
import adminRulesEn from '../../../messages/admin-rules.en.json';
import adminRulesBn from '../../../messages/admin-rules.bn.json';
import adminSearchesEn from '../../../messages/admin-searches.en.json';
import adminSearchesBn from '../../../messages/admin-searches.bn.json';
import adminSeasonalEn from '../../../messages/admin-seasonal.en.json';
import adminSeasonalBn from '../../../messages/admin-seasonal.bn.json';
import adminSeasonalHomeEn from '../../../messages/admin-seasonal-home.en.json';
import adminSeasonalHomeBn from '../../../messages/admin-seasonal-home.bn.json';
import adminSecurityEn from '../../../messages/admin-security.en.json';
import adminSecurityBn from '../../../messages/admin-security.bn.json';
import adminSeoEn from '../../../messages/admin-seo.en.json';
import adminSeoBn from '../../../messages/admin-seo.bn.json';
import adminServerEn from '../../../messages/admin-server.en.json';
import adminServerBn from '../../../messages/admin-server.bn.json';
import adminShellEn from '../../../messages/admin-shell.en.json';
import adminShellBn from '../../../messages/admin-shell.bn.json';
import adminShellSettingsEn from '../../../messages/admin-shell-settings.en.json';
import adminShellSettingsBn from '../../../messages/admin-shell-settings.bn.json';
import adminShimmerEn from '../../../messages/admin-shimmer.en.json';
import adminShimmerBn from '../../../messages/admin-shimmer.bn.json';
import adminSizechartsEn from '../../../messages/admin-sizecharts.en.json';
import adminSizechartsBn from '../../../messages/admin-sizecharts.bn.json';
import adminStockEn from '../../../messages/admin-stock.en.json';
import adminStockBn from '../../../messages/admin-stock.bn.json';
import adminStoppedEn from '../../../messages/admin-stopped.en.json';
import adminStoppedBn from '../../../messages/admin-stopped.bn.json';
import adminStoreEn from '../../../messages/admin-store.en.json';
import adminStoreBn from '../../../messages/admin-store.bn.json';
import adminSupportEn from '../../../messages/admin-support.en.json';
import adminSupportBn from '../../../messages/admin-support.bn.json';
import adminTeamEn from '../../../messages/admin-team.en.json';
import adminTeamBn from '../../../messages/admin-team.bn.json';
import adminToolsEn from '../../../messages/admin-tools.en.json';
import adminToolsBn from '../../../messages/admin-tools.bn.json';
import adminTrackingEn from '../../../messages/admin-tracking.en.json';
import adminTrackingBn from '../../../messages/admin-tracking.bn.json';
import adminVatEn from '../../../messages/admin-vat.en.json';
import adminVatBn from '../../../messages/admin-vat.bn.json';
import adminWordsEn from '../../../messages/admin-words.en.json';
import adminWordsBn from '../../../messages/admin-words.bn.json';
import adminYoutubeEn from '../../../messages/admin-youtube.en.json';
import adminYoutubeBn from '../../../messages/admin-youtube.bn.json';
import adminBlogPipelineEn from '../../../messages/admin-blog-pipeline.en.json';
import adminBlogPipelineBn from '../../../messages/admin-blog-pipeline.bn.json';
import adminGeoGuideEn from '../../../messages/admin-geo-guide.en.json';
import adminGeoGuideBn from '../../../messages/admin-geo-guide.bn.json';
import adminHouseAdsEn from '../../../messages/admin-house-ads.en.json';
import adminHouseAdsBn from '../../../messages/admin-house-ads.bn.json';
import adminMerchantFeedEn from '../../../messages/admin-merchant-feed.en.json';
import adminMerchantFeedBn from '../../../messages/admin-merchant-feed.bn.json';

/** Every admin words file by its name (messages/<name>.<lang>.json). */
export const ADMIN_WORD_FILES: Readonly<Record<string, { en: unknown; bn: unknown }>> = {
  'admin': { en: adminEn, bn: adminBn },
  'admin-ad-platforms': { en: adminAdPlatformsEn, bn: adminAdPlatformsBn },
  'admin-advance': { en: adminAdvanceEn, bn: adminAdvanceBn },
  'admin-areas': { en: adminAreasEn, bn: adminAreasBn },
  'admin-audiences': { en: adminAudiencesEn, bn: adminAudiencesBn },
  'admin-backups': { en: adminBackupsEn, bn: adminBackupsBn },
  'admin-bagbox': { en: adminBagboxEn, bn: adminBagboxBn },
  'admin-bengali': { en: adminBengaliEn, bn: adminBengaliBn },
  'admin-blog': { en: adminBlogEn, bn: adminBlogBn },
  'admin-blog-pipeline': { en: adminBlogPipelineEn, bn: adminBlogPipelineBn },
  'admin-geo-guide': { en: adminGeoGuideEn, bn: adminGeoGuideBn },
  'admin-house-ads': { en: adminHouseAdsEn, bn: adminHouseAdsBn },
  'admin-merchant-feed': { en: adminMerchantFeedEn, bn: adminMerchantFeedBn },
  'admin-books': { en: adminBooksEn, bn: adminBooksBn },
  'admin-books-daily': { en: adminBooksDailyEn, bn: adminBooksDailyBn },
  'admin-build': { en: adminBuildEn, bn: adminBuildBn },
  'admin-cache': { en: adminCacheEn, bn: adminCacheBn },
  'admin-calendar': { en: adminCalendarEn, bn: adminCalendarBn },
  'admin-calls': { en: adminCallsEn, bn: adminCallsBn },
  'admin-campaigns': { en: adminCampaignsEn, bn: adminCampaignsBn },
  'admin-canvas': { en: adminCanvasEn, bn: adminCanvasBn },
  'admin-combos': { en: adminCombosEn, bn: adminCombosBn },
  'admin-cost-ledger': { en: adminCostLedgerEn, bn: adminCostLedgerBn },
  'admin-cost-report': { en: adminCostReportEn, bn: adminCostReportBn },
  'admin-costs': { en: adminCostsEn, bn: adminCostsBn },
  'admin-courier-report': { en: adminCourierReportEn, bn: adminCourierReportBn },
  'admin-customers': { en: adminCustomersEn, bn: adminCustomersBn },
  'admin-delivery': { en: adminDeliveryEn, bn: adminDeliveryBn },
  'admin-digest': { en: adminDigestEn, bn: adminDigestBn },
  'admin-edge': { en: adminEdgeEn, bn: adminEdgeBn },
  'admin-erp-link': { en: adminErpLinkEn, bn: adminErpLinkBn },
  'admin-erp-orders': { en: adminErpOrdersEn, bn: adminErpOrdersBn },
  'admin-eta': { en: adminEtaEn, bn: adminEtaBn },
  'admin-expenses': { en: adminExpensesEn, bn: adminExpensesBn },
  'admin-experiments': { en: adminExperimentsEn, bn: adminExperimentsBn },
  'admin-eye': { en: adminEyeEn, bn: adminEyeBn },
  'admin-fees': { en: adminFeesEn, bn: adminFeesBn },
  'admin-festive': { en: adminFestiveEn, bn: adminFestiveBn },
  'admin-flags': { en: adminFlagsEn, bn: adminFlagsBn },
  'admin-fraud': { en: adminFraudEn, bn: adminFraudBn },
  'admin-fulfil': { en: adminFulfilEn, bn: adminFulfilBn },
  'admin-golive': { en: adminGoliveEn, bn: adminGoliveBn },
  'admin-health': { en: adminHealthEn, bn: adminHealthBn },
  'admin-inbox': { en: adminInboxEn, bn: adminInboxBn },
  'admin-incomplete': { en: adminIncompleteEn, bn: adminIncompleteBn },
  'admin-invoice': { en: adminInvoiceEn, bn: adminInvoiceBn },
  'admin-landing': { en: adminLandingEn, bn: adminLandingBn },
  'admin-launch': { en: adminLaunchEn, bn: adminLaunchBn },
  'admin-layouts': { en: adminLayoutsEn, bn: adminLayoutsBn },
  'admin-learning': { en: adminLearningEn, bn: adminLearningBn },
  'admin-manual': { en: adminManualEn, bn: adminManualBn },
  'admin-marketing-report': { en: adminMarketingReportEn, bn: adminMarketingReportBn },
  'admin-marketing-studio': { en: adminMarketingStudioEn, bn: adminMarketingStudioBn },
  'admin-messages': { en: adminMessagesEn, bn: adminMessagesBn },
  'admin-money': { en: adminMoneyEn, bn: adminMoneyBn },
  'admin-month-end': { en: adminMonthEndEn, bn: adminMonthEndBn },
  'admin-order-profit': { en: adminOrderProfitEn, bn: adminOrderProfitBn },
  'admin-order-report': { en: adminOrderReportEn, bn: adminOrderReportBn },
  'admin-orders': { en: adminOrdersEn, bn: adminOrdersBn },
  'admin-outreach': { en: adminOutreachEn, bn: adminOutreachBn },
  'admin-pageedit': { en: adminPageeditEn, bn: adminPageeditBn },
  'admin-policies': { en: adminPoliciesEn, bn: adminPoliciesBn },
  'admin-privacy': { en: adminPrivacyEn, bn: adminPrivacyBn },
  'admin-problems': { en: adminProblemsEn, bn: adminProblemsBn },
  'admin-products': { en: adminProductsEn, bn: adminProductsBn },
  'admin-profit': { en: adminProfitEn, bn: adminProfitBn },
  'admin-profit-channels': { en: adminProfitChannelsEn, bn: adminProfitChannelsBn },
  'admin-profit-groups': { en: adminProfitGroupsEn, bn: adminProfitGroupsBn },
  'admin-referrals': { en: adminReferralsEn, bn: adminReferralsBn },
  'admin-refunds': { en: adminRefundsEn, bn: adminRefundsBn },
  'admin-requests': { en: adminRequestsEn, bn: adminRequestsBn },
  'admin-returns': { en: adminReturnsEn, bn: adminReturnsBn },
  'admin-reviews': { en: adminReviewsEn, bn: adminReviewsBn },
  'admin-rules': { en: adminRulesEn, bn: adminRulesBn },
  'admin-searches': { en: adminSearchesEn, bn: adminSearchesBn },
  'admin-seasonal': { en: adminSeasonalEn, bn: adminSeasonalBn },
  'admin-seasonal-home': { en: adminSeasonalHomeEn, bn: adminSeasonalHomeBn },
  'admin-security': { en: adminSecurityEn, bn: adminSecurityBn },
  'admin-seo': { en: adminSeoEn, bn: adminSeoBn },
  'admin-server': { en: adminServerEn, bn: adminServerBn },
  'admin-shell': { en: adminShellEn, bn: adminShellBn },
  'admin-shell-settings': { en: adminShellSettingsEn, bn: adminShellSettingsBn },
  'admin-shimmer': { en: adminShimmerEn, bn: adminShimmerBn },
  'admin-sizecharts': { en: adminSizechartsEn, bn: adminSizechartsBn },
  'admin-stock': { en: adminStockEn, bn: adminStockBn },
  'admin-stopped': { en: adminStoppedEn, bn: adminStoppedBn },
  'admin-store': { en: adminStoreEn, bn: adminStoreBn },
  'admin-support': { en: adminSupportEn, bn: adminSupportBn },
  'admin-team': { en: adminTeamEn, bn: adminTeamBn },
  'admin-tools': { en: adminToolsEn, bn: adminToolsBn },
  'admin-tracking': { en: adminTrackingEn, bn: adminTrackingBn },
  'admin-vat': { en: adminVatEn, bn: adminVatBn },
  'admin-words': { en: adminWordsEn, bn: adminWordsBn },
  'admin-youtube': { en: adminYoutubeEn, bn: adminYoutubeBn },
};

export interface AdminWordRow {
  /** The file the word lives in (without .<lang>.json). */
  file: string;
  key: string;
  en: string;
  bn: string;
}

function flat(dict: unknown, at = '', out = new Map<string, string>()): Map<string, string> {
  if (dict && typeof dict === 'object')
    for (const [k, v] of Object.entries(dict as Dict)) {
      if (typeof v === 'string') out.set(`${at}${k}`, v);
      else flat(v, `${at}${k}.`, out);
    }
  return out;
}

let all: AdminWordRow[] | null = null;
/** Every admin word, file by file, in each file's English order (a key only in Bengali comes last). */
export function adminWordRows(): AdminWordRow[] {
  if (all) return all;
  all = Object.entries(ADMIN_WORD_FILES).flatMap(([file, d]) => {
    const en = flat(d.en);
    const bn = flat(d.bn);
    const keys = [...new Set([...en.keys(), ...bn.keys()])];
    return keys.map((key) => ({ file, key, en: en.get(key) ?? '', bn: bn.get(key) ?? '' }));
  });
  return all;
}

export interface AdminWordList {
  rows: AdminWordRow[];
  total: number;
  p: number;
  pages: number;
}

/** One page of the admin's words: a search over the file, the key and both languages. */
export function adminWordList(query: { q?: string; p?: number }, size: number): AdminWordList {
  const q = (query.q ?? '').trim().toLowerCase();
  const hit = q ? adminWordRows().filter((r) => [r.file, r.key, r.en, r.bn].some((s) => s.toLowerCase().includes(q))) : adminWordRows();
  const pages = Math.max(1, Math.ceil(hit.length / size));
  const p = Math.min(Math.max(1, Math.trunc(query.p ?? 1) || 1), pages);
  return { rows: hit.slice((p - 1) * size, p * size), total: hit.length, p, pages };
}
