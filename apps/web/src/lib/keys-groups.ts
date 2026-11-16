// PR 1020 (D12, owner order: the real admin equals prototype v5 100%) — Settings › Keys & connections as the prototype draws it
// (docs/demo/admin-proto-v5/js/m-settings.js `KG` / `renderKeys`): seven groups (Payments, Couriers, Messages, Ads & Google,
// Backups & alerts, AI providers, ERP), each connection with its name, masked key, status, "used … ago" and Test / Replace / Add key.
// This file says which group a connection belongs to and whether it is on the page itself or under "More options" (the real
// connections the prototype does not list), and works out a row's status. Pure: no React, no database.
import type { ConnectionView } from './integrations';

export const KEY_GROUPS = ['pay', 'cour', 'msg', 'ads', 'safe', 'ai', 'erp'] as const;
export type KeyGroup = (typeof KEY_GROUPS)[number];

/** The prototype's rows, in its order, per group (names: `connections.<id>.name`, matching the prototype's words). */
export const MAIN_ROWS: Record<KeyGroup, readonly string[]> = {
  pay: ['bkash', 'nagad', 'sslcommerz'],
  cour: ['pathao', 'steadfast', 'redx'],
  msg: ['bulkSmsBd', 'whatsappCloud', 'emailSending'],
  ads: ['metaAds', 'googleAds', 'tiktokAds', 'googleSearchConsole', 'googleMerchantCenter'],
  safe: ['googleDrive', 'telegram'],
  ai: ['anthropic', 'openAi', 'googleAi'],
  erp: ['extasErp'],
};

/** Real connections the prototype does not list: they stay, grouped, under "More options". */
export const MORE_ROWS: Record<KeyGroup, readonly string[]> = {
  pay: [],
  cour: ['steadfastFraud', 'pathaoFraud', 'fraudAggregator'],
  msg: ['messengerPage', 'facebookPageComments', 'instagramEngagement', 'facebookPagePublish', 'instagramPublish', 'tiktokPublish', 'youtubePublish', 'webPush'],
  ads: ['metaConversions', 'bingWebmaster', 'googleAnalytics', 'tiktokEvents'],
  safe: ['azureBlob', 's3', 'cloudflare', 'cloudflareOrigin', 'googleDriveAddOnly', 'localDisk'],
  ai: ['openRouter', 'fashn', 'fitroom', 'googleSpeech', 'pageReader'],
  erp: [],
};

export type KeyState = 'ok' | 'err' | 'none' | 'later';

/**
 * A row's status. Working: the key passed its test and the connection is on (a built-in one is always working). Need attention:
 * a key is saved but its test failed or never passed, so the shop is still on the pretend service. Not set up: no key yet.
 * `later`: nothing in the code serves it yet (no adapter), so no button is offered.
 */
export function keyState(c: Pick<ConnectionView, 'adapter' | 'builtIn' | 'managedAt' | 'keySaved' | 'enabled' | 'mode' | 'lastTest' | 'inUse'>): KeyState {
  if (!c.adapter) return 'later';
  if (c.builtIn) return c.inUse ? 'ok' : 'none';
  const live = c.enabled && c.mode !== null && c.mode !== 'MOCK';
  if (c.managedAt) return live ? 'ok' : 'none';
  if (!c.keySaved) return 'none';
  if (live && c.lastTest?.ok !== false) return 'ok';
  return 'err';
}

/** Where a connection sits: its group, and whether it is a main row or under "More options". Unknown ids go to More options of ERP. */
export function placeOf(id: string): { group: KeyGroup; more: boolean } {
  for (const g of KEY_GROUPS) {
    if (MAIN_ROWS[g].includes(id)) return { group: g, more: false };
    if (MORE_ROWS[g].includes(id)) return { group: g, more: true };
  }
  return { group: 'erp', more: true };
}

/** The masked key line: dots and the last 4 characters when they were kept, dots alone for an older key. */
export function maskOf(hint: string | null): string {
  return hint ? `••••${hint}` : '••••';
}

/** "used 9 min ago": the words key and the number. */
export function agoParts(iso: string, now: number): { unit: 'now' | 'min' | 'h' | 'd'; n: number } {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000)); // hardcode-ok: ms per minute
  if (mins < 1) return { unit: 'now', n: 0 };
  if (mins < 60) return { unit: 'min', n: mins }; // hardcode-ok: minutes per hour
  if (mins < 1440) return { unit: 'h', n: Math.floor(mins / 60) }; // hardcode-ok: minutes per day
  return { unit: 'd', n: Math.floor(mins / 1440) };
}
