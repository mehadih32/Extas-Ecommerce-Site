// S13 · PR 259–261 — every platform's read-only ads reader in one list: Marketing › Ad platforms loops these, in this
// fixed order (Meta, TikTok, Google). Kept apart from the readers so they do not import each other.
import { META_ADS_PROVIDER, metaAdsAdapter, type AdsPlatform } from './meta-ads';
import { GOOGLE_ADS_PROVIDER, googleAdsAdapter } from './google-ads';
import { TIKTOK_ADS_PROVIDER, tiktokAdsAdapter } from './tiktok-ads';

/** Each platform's ads reader connection. */
export const ADS_READER_CONNECTION: Partial<Record<AdsPlatform, { kind: 'META' | 'GOOGLE' | 'TIKTOK'; provider: string }>> = {
  meta: { kind: 'META', provider: META_ADS_PROVIDER },
  tiktok: { kind: 'TIKTOK', provider: TIKTOK_ADS_PROVIDER },
  google: { kind: 'GOOGLE', provider: GOOGLE_ADS_PROVIDER },
};

export const adsReaderAdapters = [metaAdsAdapter, tiktokAdsAdapter, googleAdsAdapter] as const;
