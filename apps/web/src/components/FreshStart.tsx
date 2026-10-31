'use client';
// PR 12 (CN-032) — the "Start fresh" button (lib/fresh-start.ts): clears this site's saved data in this browser, then
// opens the sign-in page (from the admin) or the page the person was on.
import { useState } from 'react';
import type { Dict } from '@/lib/i18n';
import { t } from '@/lib/i18n';

/** Asks the site to clear this browser's data for it; true when the site answered. */
export async function freshStart(level: 'soft' | 'full'): Promise<boolean> {
  try {
    const res = await fetch('/api/fresh-start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level }), cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Where to go after a full fresh start: the admin's sign-in from an admin page or from `/fresh-start?to=admin`, the
 * shop's home (in the page's language) from the fresh-start page, else the same page.
 */
export function afterFresh(path: string, search = ''): string {
  if (path === '/admin' || path.startsWith('/admin/') || new URLSearchParams(search).get('to') === 'admin') return '/admin/login';
  return path.endsWith('/fresh-start') ? path.replace(/\/fresh-start$/, '') || '/' : path;
}

export function FreshStartButton({ dict, className }: { dict: Dict; className?: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');
  async function go() {
    setState('working');
    if (!(await freshStart('full'))) return setState('failed');
    setState('done');
    window.location.replace(afterFresh(window.location.pathname, window.location.search));
  }
  return (
    <>
      <button type="button" className={className} onClick={go} disabled={state === 'working' || state === 'done'} data-testid="fresh-start">
        {state === 'working' ? t(dict, 'working') : t(dict, 'fresh')}
      </button>
      <p role="status" data-testid="fresh-state">
        {state === 'done' ? t(dict, 'done') : state === 'failed' ? t(dict, 'failed') : t(dict, 'freshNote')}
      </p>
    </>
  );
}
