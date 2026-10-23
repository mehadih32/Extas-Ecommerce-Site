'use client';
// PR 12 (SH-07) — an admin page that failed while drawing: the shell's "could not load" state inside the shell, with
// Retry (draws the page again) and the error id the server logged (Next's digest), never the error's own text.
import Link from 'next/link';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { useShellText } from '@/components/admin/shell/ShellText';
import { t } from '@/lib/i18n';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { dict, lang, inShell } = useShellText();
  const tt = (k: string) => t(dict, `shell.state.error.${k}`);
  const state = (
    <div className="a2-state err" data-testid="a2-state" data-state="error" role="alert">
      <div className="a2-sti">
        <ShellIcon name="alert" size={26} />
      </div>
      <h3>{tt('title')}</h3>
      <p>{tt('body')}</p>
      {error.digest ? (
        <span className="a2-errid">
          {tt('id')} · {error.digest}
        </span>
      ) : null}
      <div className="a2-gap8">
        <button type="button" className="a2-btn pri" onClick={() => reset()} data-testid="a2-retry">
          <ShellIcon name="refresh" size={16} />
          {tt('retry')}
        </button>
        <Link className="a2-btn" href="/admin?home=1">
          {tt('back')}
        </Link>
      </div>
    </div>
  );
  if (inShell) return <div className="a2-z">{state}</div>;
  return (
    <div className="adm2" lang={lang}>
      <main className="a2-ct a2-z" id="main">
        {state}
      </main>
    </div>
  );
}
