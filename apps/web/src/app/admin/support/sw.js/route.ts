// S22 · PR 435 (Blueprint B4.11) — the support app's service worker, served for the scope /admin/support (wider than
// its own folder, so the `Service-Worker-Allowed` header says so). It shows a push as a notification (one per chat: the
// tag folds a chat's), opens or focuses the chat on a tap, and when the phone has no internet shows a short page in both
// languages instead of the browser's error. It keeps no page and no data (support is private and changes every minute).
// While `support.app` is off it removes itself from the browser.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminDeps } from '@/lib/admin-auth';
import { inboxDicts } from '@/lib/admin-support/i18n';
import { t } from '@/lib/i18n';
import { SUPPORT_APP } from '@/lib/support-push';

export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function offlinePage(): string {
  const line = (lang: 'en' | 'bn') => `<h1>${esc(t(inboxDicts[lang], 'sup.app.offline.title'))}</h1><p>${esc(t(inboxDicts[lang], 'sup.app.offline.body'))}</p>`;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui,sans-serif;padding:24px">${line('en')}${line('bn')}</body>`;
}

function worker(on: boolean): string {
  if (!on) return `self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',(e)=>e.waitUntil(self.registration.unregister()));`;
  const cfg = JSON.stringify({ scope: SUPPORT_APP.scope, icon: SUPPORT_APP.icon(192), offline: offlinePage() });
  return `const CFG=${cfg};
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',(e)=>e.waitUntil(self.clients.claim()));
self.addEventListener('push',(e)=>{let d={};try{d=e.data?e.data.json():{}}catch(_){d={}}
e.waitUntil(self.registration.showNotification(d.title||'',{body:d.body||'',tag:d.tag||undefined,renotify:!!d.tag,icon:CFG.icon,badge:CFG.icon,data:{url:d.url||CFG.scope}}));});
self.addEventListener('notificationclick',(e)=>{e.notification.close();const url=new URL((e.notification.data&&e.notification.data.url)||CFG.scope,self.location.origin).href;
e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then((ws)=>{const scope=new URL(CFG.scope,self.location.origin).href;for(const w of ws){if(w.url.startsWith(scope)&&'focus'in w){return w.focus().then((f)=>f&&'navigate'in f?f.navigate(url):f).catch(()=>self.clients.openWindow(url));}}return self.clients.openWindow(url);}));});
self.addEventListener('fetch',(e)=>{if(e.request.mode!=='navigate')return;e.respondWith(fetch(e.request).catch(()=>new Response(CFG.offline,{headers:{'content-type':'text/html; charset=utf-8'}})));});
`;
}

export async function GET(): Promise<Response> {
  const deps = adminDeps();
  const app = deps ? await deps.resolver.value('support.app', { storeId: MOTHER_STORE_ID }).catch(() => null) : null;
  return new Response(worker(!!app?.enabled), {
    headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache', 'service-worker-allowed': SUPPORT_APP.scope },
  });
}
