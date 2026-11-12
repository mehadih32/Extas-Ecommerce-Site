// S15 · PR 322 (Blueprint C10.4 "new lessons become versioned skills only after a sandbox test (PR 322)"; the
// demo's own AIC-04a "Skill sandbox" screen) — AI › Skills › Sandbox at `/admin/ai/skills/sandbox`: pick any
// skill and a 7/30-day order window, run a read-only test against the store's own real orders, and see the
// result plus every earlier run of that skill. Permission `ai.read` to see this page, `ai.skills.write` to
// actually run a test (the same permission that already governs this skill's own management).
// Guide: docs/admin-guide/pages/ai/skills-sandbox.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { SkillSandboxForm } from '@/components/admin/ai/SkillSandboxForm';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { sandboxHistory, SANDBOX_DATA_WINDOWS } from '@/lib/admin-ai/skill-sandbox';
import { skillLibraryView } from '@/lib/admin-ai/skills';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../messages/admin-ai.bn.json';
import en from '../../../../../../messages/admin-ai.en.json';
import '../../ai.css';

export const dynamic = 'force-dynamic';

const KEY = 'aiSkillsSandbox';
const HERE = '/admin/ai/skills/sandbox';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, aiSkillsSandbox: (view.lang === 'bn' ? bn : en).aiSkillsSandbox as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'aiSkillsSandbox.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AiSkillsSandboxPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('ai.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="skills-sandbox-page">
        <ShellState view={view} kind="denied" permission="ai.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `aiSkillsSandbox.${k}`, vars);
  const canRun = access.guard.permissions?.has('ai.skills.write') ?? false;

  const [skills, currency] = await Promise.all([
    skillLibraryView({ db: access.deps.db }),
    access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>,
  ]);
  const first = skills[0] ?? null;
  const initialHistory = first ? await sandboxHistory({ db: access.deps.db }, first.key) : [];
  const money = moneyOf(currency, view.locale);

  return (
    <div className="a2-z ai-page ai-sk" data-testid="skills-sandbox-page">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      {!canRun ? (
        <div className="a2-note a2-mt12" role="note" data-testid="ai-sbx-readonly">
          <span>{c('needPermission')}</span>
        </div>
      ) : null}

      {skills.length ? (
        <SkillSandboxForm
          dict={d}
          locale={view.locale}
          timeZone={view.timeZone}
          skills={skills.map((s) => ({ id: s.id, key: s.key, label: s.name }))}
          dataWindows={SANDBOX_DATA_WINDOWS}
          canRun={canRun}
          initialHistory={initialHistory.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
          money={(minor: number) => formatMoney(minor, money)}
        />
      ) : (
        <div className="a2-note a2-mt12" role="note" data-testid="ai-sbx-empty">
          <span>{c('empty')}</span>
        </div>
      )}
    </div>
  );
}
