// PR 12 (SH-07) — an admin address that does not exist: the shell's "page not found" state inside the shell (HTTP 404),
// with search and the way back to the Dashboard. A smoke check opens one on every deploy.
import { ShellState } from '@/components/admin/shell/ShellParts';
import { adminView } from '@/lib/admin-page';
import { shellSession } from '@/lib/admin-shell/session';
import { t } from '@/lib/i18n';

export default async function AdminNotFound() {
  const view = await adminView();
  // CN-053: someone who is not signed in sees a bare "Page not found" and nothing that says an admin is here
  // (no search, no way back to the Dashboard, no styled admin frame).
  if ((await shellSession()).kind !== 'ok')
    return (
      <main id="main" lang={view.lang} data-testid="plain-404">
        <h1>{t(view.dict, 'shell.state.notfound.title')}</h1>
      </main>
    );
  const state = <ShellState view={view} kind="notfound" />;
  if ((await shellSession()).kind === 'ok') return <div className="a2-z">{state}</div>;
  return (
    <div className="adm2" lang={view.lang}>
      <main className="a2-ct a2-z" id="main">
        {state}
      </main>
    </div>
  );
}
