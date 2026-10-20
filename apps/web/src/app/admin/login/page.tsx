// PR 500 — the admin sign-in (on the PR 15 login API). Drawn without a database too (CI, Lighthouse): the form then
// says that nobody can sign in yet.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Brand, langLabels } from '@/components/admin/AdminFrame';
import { LangSwitch } from '@/components/admin/LangSwitch';
import { LoginForm } from '@/components/admin/LoginForm';
import { adminDeps } from '@/lib/admin-auth';
import { safeNext } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'login.metaTitle'), robots: { index: false, follow: false } };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const deps = adminDeps();
  const view = await adminView(deps);
  const next = safeNext(params.next);
  let step: 'login' | 'password' = 'login';
  if (deps) {
    const access = await pageAccess(null, deps);
    if (access.kind === 'ok') redirect(next);
    if (access.kind === 'password') step = 'password';
  }
  const labels = langLabels(view);
  return (
    <div className="ad ad-login" lang={view.lang}>
      <header className="ad-top">
        <Brand view={view} logo="top" />
        <LangSwitch current={view.lang} labels={labels} where="top" />
      </header>
      <main className="ad-login-main" id="main">
        <div className="ad-login-card">
          <LangSwitch current={view.lang} labels={labels} where="main" />
          <section className="ad-card">
            <LoginForm dict={view.dict} next={next} initialStep={step} locale={view.locale} timeZone={view.timeZone} disabled={!deps} />
          </section>
        </div>
      </main>
    </div>
  );
}
