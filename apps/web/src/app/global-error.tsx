'use client';
// PR 12 (CN-032) — the last safety net: an error no page or section boundary caught (a layout, the admin shell, a
// browser that broke the page) shows this screen instead of a blank page. Once per two minutes in a tab it first clears
// this site's cache and storage by itself (the sign-in stays) and opens the page again, which mends a stale stored value
// or a stale file without anyone pressing anything. If the page still fails, it shows "Start fresh" (lib/fresh-start.ts)
// and "Try again", in Bengali and English (no language is known here: the layouts did not draw), with the error's short
// id or first line for the team. Nothing personal is shown.
import { useEffect, useState } from 'react';
import bn from '../../messages/recover.bn.json';
import en from '../../messages/recover.en.json';
import { FreshStartButton, freshStart } from '@/components/FreshStart';
import { AUTO_KEY, mayAutoRecover } from '@/lib/fresh-start';
import { t } from '@/lib/i18n';
import './global-error.css';

function readAuto(): string | null {
  try {
    return window.sessionStorage.getItem(AUTO_KEY);
  } catch {
    return String(Date.now()); // storage refused: never try by itself, so a failing page can never loop
  }
}

function markAuto(now: number): boolean {
  try {
    window.sessionStorage.setItem(AUTO_KEY, String(now));
    return window.sessionStorage.getItem(AUTO_KEY) === String(now);
  } catch {
    return false;
  }
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [trying, setTrying] = useState(true);
  useEffect(() => {
    const now = Date.now();
    const auto = mayAutoRecover(readAuto(), now) && markAuto(now);
    void (auto ? freshStart('soft') : Promise.resolve(false)).then((ok) => (ok ? window.location.reload() : setTrying(false)));
  }, []);
  const detail = error.digest ?? error.message.split('\n')[0]?.slice(0, 160);
  return (
    <html lang="bn" translate="no">
      <body className="ge">
        <main className="ge-card" role="alert" data-testid="global-error" aria-busy={trying}>
          {[bn, en].map((d, i) => (
            <section key={i} lang={i === 0 ? 'bn' : 'en'} className="ge-lang">
              <h1>{t(d, 'title')}</h1>
              <p>{t(d, 'body')}</p>
            </section>
          ))}
          {trying ? null : (
            <div className="ge-actions">
              <FreshStartButton dict={bn} className="ge-btn pri" />
              <button type="button" className="ge-btn" onClick={() => reset()} lang="bn">
                {t(bn, 'retry')}
              </button>
            </div>
          )}
          {detail ? (
            <p className="ge-detail" lang="en">
              {t(en, 'detail')}: {detail}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
