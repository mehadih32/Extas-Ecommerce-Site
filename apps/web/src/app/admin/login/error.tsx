'use client';
// CN-053 (14 Nov 2026) — the sign-in page failed while drawing or in the browser: never a blank screen. A visible message
// and "Reload", which first clears this browser's saved admin choices (a corrupted one was the suspected cause of the
// blank sign-in page) and loads the address again. The words are the admin shell's own (`shell.state.error.*`).
import { useShellText } from '@/components/admin/shell/ShellText';
import { clearAdminPrefs } from '@/lib/admin-prefs-client';
import { t } from '@/lib/i18n';

export default function LoginError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { dict, lang } = useShellText();
  const tt = (k: string) => t(dict, `shell.state.error.${k}`);
  const reload = () => {
    clearAdminPrefs();
    window.location.reload();
  };
  return (
    <div className="adm2" lang={lang} translate="no">
      <main className="a2-ct a2-z" id="main">
        <div className="a2-state err" data-testid="login-error" role="alert">
          <h3>{tt('title')}</h3>
          <p>{tt('body')}</p>
          {error.digest ? <span className="a2-errid">{tt('id')} · {error.digest}</span> : null}
          <div className="a2-gap8">
            <button type="button" className="a2-btn pri" onClick={reload} data-testid="login-reload">
              {tt('reload')}
            </button>
            <button type="button" className="a2-btn" onClick={() => reset()}>
              {tt('retry')}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
