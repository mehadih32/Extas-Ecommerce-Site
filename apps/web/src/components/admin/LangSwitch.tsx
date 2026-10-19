'use client';
// The EN | বাং switch (demo 98a-admin-lang.js): full words in the sidebar, short ones in the phone top bar; on a
// phone under 380 px it moves to the top of the page. The choice is a cookie; the server redraws in that language.
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { ADMIN_LANG_COOKIE } from '@/lib/admin-nav';

export interface LangLabels {
  group: string;
  en: string;
  enShort: string;
  bn: string;
  bnShort: string;
}

const YEAR_SECONDS = 365 * 24 * 60 * 60;

export function LangSwitch({ current, labels, where }: { current: 'bn' | 'en'; labels: LangLabels; where: 'side' | 'top' | 'main' }) {
  const router = useRouter();
  const [, start] = useTransition();
  const pick = (v: 'bn' | 'en') => {
    if (v === current) return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${ADMIN_LANG_COOKIE}=${v}; Path=/admin; Max-Age=${YEAR_SECONDS}; SameSite=Lax${secure}`;
    start(() => router.refresh());
  };
  const button = (v: 'bn' | 'en', full: string, short: string) => (
    <button type="button" aria-pressed={current === v} aria-label={full} lang={v} onClick={() => pick(v)}>
      <span className="f" aria-hidden="true">{full}</span>
      <span className="s" aria-hidden="true">{short}</span>
    </button>
  );
  return (
    <div className={`ad-lang ad-lang-${where}`} translate="no" role="group" aria-label={labels.group}>
      {button('en', labels.en, labels.enShort)}
      {button('bn', labels.bn, labels.bnShort)}
    </div>
  );
}
