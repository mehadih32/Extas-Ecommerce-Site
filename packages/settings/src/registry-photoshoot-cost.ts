// S24 · PR 450 (Blueprint C7.6 "cost shown before a batch", C7.19's "headline metric: cost per approved image") —
// the owner's own per-image photoshoot rate, in paisa, read by the provider adapters' `estimate()` so a batch's
// cost preview is arithmetic on a real number, never an invented one (CN-018: every amount is a setting, off/0 by
// default until the owner sets it). A rate of 0 for a provider/tier means the estimate comes back `null`
// (`photoshootEstimateFromRate`, @extas/adapters). The hard spend cap, the AI Cost Book rows and the Photoshoot
// agent's monthly cap (C7.20) are a later PR (S24 item 16, the cost ledger) — this is only the rate its arithmetic
// reads; nothing here spends, generates or caps anything by itself.
//
// Version note (PR 451, carrying PR 447 forward into the same branch): PR 450 was first filed at v288 from its own
// branch's view of main; PR 444–448's own `registry-photoshoot.ts` (the garment-prep colour tolerance) independently
// took v288 too, from ITS branch's view. Combining both still-open branches in this one PR, as the register's
// "build cumulative, FIX lane resolves overlap at merge time" pattern expects, bumped this file to v289 so the two
// never collide inside this branch; the FIX lane does the same renumbering (or picks one) when it actually merges.
import { z } from 'zod';
import { setting } from './define';

const V = 289;

const providerTierRateSchema = z
  .object({
    /** Paisa per approved image at this provider's baseline tier (e.g. FASHN Try-On v1.6). 0 = not set yet. */
    baseline: z.number().int().min(0),
    /** Paisa per approved image at this provider's premium tier (e.g. FASHN Try-On Max). 0 = not set yet. */
    premium: z.number().int().min(0),
  })
  .strict();

export const photoshootRatesSchema = z
  .object({
    fashn: providerTierRateSchema,
    fitroom: providerTierRateSchema,
  })
  .strict();
export type PhotoshootRatesSettings = z.infer<typeof photoshootRatesSchema>;
export const PHOTOSHOOT_RATES_DEFAULT: PhotoshootRatesSettings = {
  fashn: { baseline: 0, premium: 0 },
  fitroom: { baseline: 0, premium: 0 },
};

export const photoshootCostSettings = {
  'studio.photoshoot.rates': setting({
    schema: photoshootRatesSchema,
    default: PHOTOSHOOT_RATES_DEFAULT,
    scope: 'store',
    valueType: 'JSON',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.photoshoot.rates.label',
    helpKey: 'studio.photoshoot.rates.help',
    sortOrder: 13,
    version: V,
  }),
};
