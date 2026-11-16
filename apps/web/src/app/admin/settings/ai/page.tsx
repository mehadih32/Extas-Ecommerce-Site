// D10 (PR 1008) — Settings › AI control at /admin/settings/ai, drawn as prototype v5 draws it (m-settings.js `renderAi`): "AI
// now has its own menu: AI Center. This is a quick look." One hero (on or off, agents running, this month against the cap,
// what waits for the owner's OK, "Open AI Center") and four link cards. The whole control room that used to open from this
// list item (master switch, every agent, data routing, the AI-off test) sits on the SAME page under "More options" — nothing
// was removed. Seeing needs `ai.read`; the switches inside need `ai.control`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AiControlRoom } from '@/components/admin/ai/ControlRoom';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { controlRoomView } from '@/lib/admin-ai/control-room';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-ai.bn.json';
import en from '../../../../../messages/admin-ai.en.json';
import '../system/sysinfo.css';
import '../../s28.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/settings/ai';
const KEY = 'settingsAi';
/** The four cards under the hero, in the prototype's order. */
const LINKS = [
  { id: 'approvals', href: '/admin/ai/approvals' },
  { id: 'agents', href: '/admin/agents' },
  { id: 'costs', href: '/admin/ai/cost-book' },
  { id: 'train', href: '/admin/ai/training' },
] as const;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, aiControl: (view.lang === 'bn' ? bn : en).aiControl as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'aiControl.short.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function SettingsAiPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('ai.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="settings-ai" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="ai.read" />
      </div>
    );
  const c = (k: string, vars?: Record<string, string | number>) => t(view.dict, `aiControl.short.${k}`, vars);
  const { view: o } = await controlRoomView({ db: access.deps.db, resolver: access.deps.resolver, vault: access.deps.vault }, MOTHER_STORE_ID);
  const waiting = await access.deps.db.aiApprovalRequest.count({ where: { status: 'PENDING' } });
  const money = moneyOf(o.currency, view.locale);
  const amount = (minor: number) => formatMoney(minor, money);
  const n = (x: number) => formatNumber(x, view.locale);
  const vars = { running: n(o.runningNow), total: n(o.agentCount), used: amount(o.monthMinor), waiting: n(waiting) };
  const line =
    o.monthlyCapMinor && o.monthlyCapMinor > 0
      ? c('line', { ...vars, cap: amount(o.monthlyCapMinor), pct: n(Math.round((o.monthMinor / o.monthlyCapMinor) * 100)) })
      : c('lineNoCap', vars);

  return (
    <div className="a2-z lm-st" data-lm-ready="" data-testid="settings-ai">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      <section className="a2-sc a2-mt12 sy-hero" data-testid="settings-ai-hero" data-on={o.masterOn ? 'yes' : 'no'}>
        <i className={`sy-dot${o.masterOn ? '' : ' off'}`} aria-hidden="true" />
        <div className="s28-grow">
          <div className="sy-big">{o.masterOn ? c('on') : c('off')}</div>
          <div className="a2-scd">{line}</div>
        </div>
        <Link className="a2-btn pri" href="/admin/ai/approvals">
          <ShellIcon name="spark" size={15} />
          {c('open')}
        </Link>
      </section>

      <div className="s28-grid a2-mt12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }} data-testid="settings-ai-links">
        {LINKS.map((l) => (
          <Link key={l.id} className="a2-card" href={l.href} style={{ textDecoration: 'none', color: 'inherit' }} data-testid={`settings-ai-link-${l.id}`}>
            <b>{c(`links.${l.id}.n`)} →</b>
            <div className="a2-xs a2-mute">{c(`links.${l.id}.d`)}</div>
          </Link>
        ))}
      </div>

      <details className="a2-card a2-mt12" data-testid="settings-ai-more">
        <summary className="a2-h3" style={{ cursor: 'pointer', minHeight: 44 }}>
          {c('more')}
        </summary>
        <div className="a2-cs">{c('moreSub')}</div>
        <AiControlRoom embedded />
      </details>
    </div>
  );
}
