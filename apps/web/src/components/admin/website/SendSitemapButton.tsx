'use client';
// PR 1051 — SEO overview › "Send sitemap again": the same call as the Search engines card's "Send the sitemap"
// (POST /api/admin/seo/search-engines; each connected engine gets the sitemap, an engine without a key sends nothing).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';

export function SendSitemapButton({ label, busy, done, failed }: { label: string; busy: string; done: string; failed: string }) {
  const router = useRouter();
  const [going, setGoing] = useState(false);
  async function go() {
    setGoing(true);
    try {
      const res = await fetch('/api/admin/seo/search-engines', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: '{}' });
      showToast(res.ok ? { text: done, tone: 'ok' } : { text: failed, tone: 'bad' });
      if (res.ok) router.refresh();
    } catch {
      showToast({ text: failed, tone: 'bad' });
    }
    setGoing(false);
  }
  return (
    <button type="button" className="a2-btn sm a2-mt6" disabled={going} onClick={() => void go()} data-testid="seo-send-sitemap">
      {going ? busy : label}
    </button>
  );
}
