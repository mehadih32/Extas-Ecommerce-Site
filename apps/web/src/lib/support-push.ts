// S22 · PR 435 (Blueprint B4.11) — the support app's wiring on the server: the push connection (Keys & connections →
// "Push notifications (support app)", @extas/adapters `webPush`; its mock until the shop's VAPID key pair is in and its
// Test passed, so nothing leaves the server) and the notifications' words in each employee's admin language
// (messages/admin-inbox.<lang>.json, `sup.app.push.*`). One connection layer per process, cached like every connection.
// The support core decides who is told (packages/support/src/push.ts); every support entry point (the admin's actions,
// the WhatsApp and Messenger webhooks, the site's live chat) passes this wiring.
import { createConnections, WEB_PUSH_PROVIDER, webPushAdapters, type PushSender } from '@extas/adapters';
import { MOTHER_STORE_ID } from '@extas/db/client';
import type * as sp from '@extas/support';
import { t } from '@/lib/i18n';
import type { AdminDeps } from './admin-auth';
import { inboxDicts } from './admin-support/i18n';

/** Where the support app lives (its scope) and its parts (manifest, worker, icons). */
export const SUPPORT_APP = {
  scope: '/admin/support',
  page: '/admin/support/app',
  manifest: '/admin/support/app.webmanifest',
  worker: '/admin/support/sw.js',
  icon: (size: number) => `/admin/support/app-icon/${size}`,
  chat: (id: string) => `/admin/support/c/${id}`,
} as const;

/** The app's colours: the admin frame's own green and paper (shell.css `--g`, `--bg`), so the icon matches the admin. */
export const SUPPORT_APP_COLOURS = { background: '#1F4E46', ink: '#F6F4EF' } as const;

/** The name under the icon: the one typed in Support settings, else the shop's name and "Support". */
export async function supportAppName(d: Pick<AdminDeps, 'resolver'>, typed: string, lang: 'en' | 'bn'): Promise<string> {
  if (typed.trim()) return typed.trim();
  const store = String((await d.resolver.value('store.name', { storeId: MOTHER_STORE_ID }).catch(() => '')) ?? '').trim();
  const word = t(inboxDicts[lang], 'sup.app.word');
  return store ? `${store} ${word}` : word;
}

/** The icon sizes the manifest lists (Android's two, Apple's touch icon). */
export const SUPPORT_APP_ICON_SIZES = [192, 512, 180] as const;

type Connections = ReturnType<typeof createConnections>;
const holder = globalThis as unknown as { __supportPushConnections?: { connections: Connections; at: number; ttlMs: number } };

async function connectionsOf(d: Pick<AdminDeps, 'db' | 'resolver' | 'vault'>): Promise<Connections> {
  const now = Date.now();
  const hit = holder.__supportPushConnections;
  if (hit && now - hit.at < hit.ttlMs) return hit.connections;
  const [testSeconds, cacheSeconds] = await Promise.all([d.resolver.value('system.integrationTestTimeoutSeconds'), d.resolver.value('system.integrationKeyCacheSeconds')]);
  const connections = createConnections({ db: d.db, vault: d.vault ?? { get: async () => null }, adapters: webPushAdapters, secretCacheMs: cacheSeconds * 1000, testTimeoutMs: testSeconds * 1000 });
  holder.__supportPushConnections = { connections, at: now, ttlMs: cacheSeconds * 1000 };
  return connections;
}

/** The push connection (one for the installation; a store's own row wins when there is one). */
export async function pushSenderOf(d: Pick<AdminDeps, 'db' | 'resolver' | 'vault'>): Promise<PushSender> {
  return (await (await connectionsOf(d)).use<PushSender>('PUSH', { storeId: MOTHER_STORE_ID, provider: WEB_PUSH_PROVIDER })).api;
}

/** A notification's title and body in one language. */
export function pushWords(lang: 'en' | 'bn', f: sp.SupportPushFacts): { title: string; body: string } {
  const d = inboxDicts[lang];
  if (f.kind === 'test') return { title: t(d, 'sup.app.push.testTitle'), body: t(d, 'sup.app.push.testBody') };
  const channel = t(d, `sup.kind.${f.channelKind}`);
  const title = f.name ?? t(d, 'sup.app.push.someone');
  if (f.kind === 'assigned') return { title, body: t(d, 'sup.app.push.assigned', { channel }) };
  return { title, body: f.text ?? t(d, 'sup.app.push.message', { channel }) };
}

/** The support core's push wiring. */
export function supportPushWiring(d: Pick<AdminDeps, 'db' | 'resolver' | 'vault'>): sp.SupportPushWiring & { publicKey: () => Promise<string | null> } {
  return {
    sender: () => pushSenderOf(d),
    publicKey: async () => (await pushSenderOf(d)).publicKey,
    words: pushWords,
    url: (id) => (id ? SUPPORT_APP.chat(id) : SUPPORT_APP.scope),
  };
}
