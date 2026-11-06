// PR 247 / PR 40 follow-up (6 Nov) — what the checkout offers this store now, read once per request: the checkout's own
// `paySettings` (packages/checkout: the owner's switches and each gateway; a method switched off, or still on the
// practice gateway while test payments are off, is not offered). "Ways to pay" (/help/payment) and the footer's payment
// marks both read it, so neither can show a method the checkout would not take. Without a database, or when it is slow,
// it is null and the readers show no prepaid method.
import { cache } from 'react';
import { paySettings } from '@extas/checkout';
import { settingsTimeoutMs, withTimeout } from '../settings';
import { checkoutDeps } from './checkout';
import type { PayOffer } from './help-pages';

export const shopPayOffer = cache(async (storeId: number): Promise<PayOffer | null> => {
  const deps = checkoutDeps();
  if (!deps) return null;
  try {
    const p = await withTimeout(paySettings(deps, storeId), settingsTimeoutMs());
    return { cod: p.cod, mobile: p.mobile, card: p.card, online: p.online };
  } catch {
    return null;
  }
});
