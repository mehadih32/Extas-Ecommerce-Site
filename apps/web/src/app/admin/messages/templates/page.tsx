// S14 · PR 505 — Messages → Templates (MSG-03, ADMIN-ARCHITECTURE §4.6; demo V12.4 #/admin/messages/templates): every
// SMS, WhatsApp and e-mail text the shop sends. On the left the templates — first the order journey's, in its order,
// then the other messages, then the ones nothing sends now — each with its channels and what needs a look. On the
// right the open one (`?key=`): which message sends it, the words filled in for each order, and per channel its
// English and Bengali side by side with a live preview on the sample order (cash on delivery, prepaid, part-paid; the
// engine's own rules, so a paid customer is never asked for money and an empty link is never promised), Save, Reset to
// default, and a missing language added. Below, the auto-reply (off). Seeing needs `messages.templates.read`, changing
// `messages.templates.write` (the API checks it again). Nothing on this page sends a message.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as ms from '@extas/messages';
import { AUTO_REPLY_WHEN, JOURNEY_STEPS, MESSAGE_CHANNELS } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AutoReplyForm } from '@/components/admin/messages/AutoReplyForm';
import { TemplateAdd, TemplateEditor } from '@/components/admin/messages/TemplateEditor';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { label, withMessages } from '@/lib/admin-messages/i18n';
import { groupTemplates, openGroup } from '@/lib/admin-messages/templates-view';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { messagesDeps } from '@/lib/messages-api';
import '../../settings-cards.css';
import '../messages.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/messages/templates';
const KEY = 'messagesTemplates';

export async function generateMetadata(): Promise<Metadata> {
  const view = withMessages(await adminView());
  return { title: `${t(view.dict, 'msg.tpl.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('messages.templates.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withMessages(plain);
  const d = view.dict;
  const asked = typeof sp.key === 'string' ? sp.key.slice(0, 80) : null;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(asked ? `${HERE}?key=${encodeURIComponent(asked)}` : HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="messages.templates.read" />
      </div>
    );
  const who: ms.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const screen = await ms.templatesScreen(await messagesDeps(access.deps), who);
  const md: Dict = { msg: d.msg as Dict };
  const x = (k: string, v: Record<string, string> = {}) => t(d, `msg.tpl.${k}`, v);
  const grouped = groupTemplates(screen.groups, JOURNEY_STEPS);
  const open = openGroup(grouped, asked);
  const can = screen.perms.write;
  // a template's name on the list: the step (or other message) that sends it, else its own name; its own name too when
  // that step sends more than one template (the stop and the start answer, the answers to 1 / 2 / 3)
  const useCount = new Map<string, number>();
  for (const g of screen.groups) if (g.uses[0]) useCount.set(g.uses[0].use, (useCount.get(g.uses[0].use) ?? 0) + 1);
  const titleOf = (g: ms.TemplateGroup) => (g.uses[0] && (useCount.get(g.uses[0].use) ?? 0) < 2 ? label(d, 'step', g.uses[0].use) : g.name);
  const langName = (l: string) => x(`lang.${l === 'en' ? 'en' : 'bn'}`);
  const section = (id: 'journey' | 'other' | 'unused', list: ms.TemplateGroup[]) =>
    list.length ? (
      <div key={id} className="a2-stack" style={{ gap: 6 }}>
        <h2 className="a2-xs a2-mute" style={{ margin: '6px 2px 0', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          {x(`groups.${id}`)}
        </h2>
        {list.map((g) => {
          const chans = MESSAGE_CHANNELS.filter((c) => g.rows.some((r) => r.channel === c));
          return (
            <Link key={g.key} className={`a2-qi${open?.key === g.key ? ' on' : ''}`} href={`${HERE}?key=${encodeURIComponent(g.key)}`} aria-current={open?.key === g.key ? 'page' : undefined} data-testid="tpl-item" data-key={g.key}>
              <div>
                <b>{titleOf(g)}</b>
                <span>
                  {chans.map((c) => label(d, 'channel', c)).join(' · ') || t(d, 'msg.none')}
                  {g.edited ? ` · ${x('edited')}` : ''}
                </span>
                {g.problems || g.missing.length ? (
                  <span className="a2-gap8" style={{ marginTop: 4 }}>
                    {g.missing.length ? <span className="a2-pill bad">{x('missing', { n: String(g.missing.length) })}</span> : null}
                    {g.problems ? <span className="a2-pill warn">{x('problems', { n: String(g.problems) })}</span> : null}
                  </span>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    ) : null;

  return (
    <div className="a2-z" data-testid="messages-templates">
      <PageHead view={view} place={locateKey(KEY)} title={x('title')} sub={x('sub')} />
      <SectionTabs view={view} current={KEY} />
      {!screen.hasHost ? (
        <div className="a2-note warn">
          <ShellIcon name="alert" size={15} />
          <span>{x('noHost')}</span>
        </div>
      ) : null}
      {!can ? (
        <div className="a2-note">
          <ShellIcon name="lock" size={15} />
          <span>{t(d, 'msg.readOnly')}</span>
        </div>
      ) : null}
      <div className="a2-row a2-r12 a2-mt12" style={{ alignItems: 'start' }}>
        <nav className="a2-q" aria-label={x('listLabel')} data-testid="tpl-list">
          {section('journey', grouped.journey)}
          {section('other', grouped.other)}
          {section('unused', grouped.unused)}
        </nav>
        {open ? (
          <section className="a2-card" aria-labelledby="tpl-open-h" data-testid="tpl-open" data-key={open.key}>
            <div className="a2-ch">
              <div>
                <h2 className="a2-h3" id="tpl-open-h">
                  {titleOf(open)}
                </h2>
                <div className="a2-xs a2-mute a2-mono">{open.key}</div>
              </div>
            </div>
            <div className="a2-h4">{x('usedBy')}</div>
            {open.uses.length ? (
              <ul className="a2-stack a2-mt6" style={{ gap: 4, paddingLeft: 18, margin: 0 }} data-testid="tpl-uses">
                {open.uses.map((u) => (
                  <li key={`${u.use}-${u.channels.join()}`} className="a2-sm">
                    {label(d, 'step', u.use)} · {u.channels.map((c) => label(d, 'channel', c)).join(', ') || t(d, 'msg.none')} · <span className={`a2-pill ${u.on ? 'ok' : 'line'}`}>{x(u.on ? 'on' : 'off')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-xs a2-mute a2-mt6">{x('notUsed')}</p>
            )}
            <div className="a2-mt12">
              <span className="a2-xs a2-mute">{x('tokens')} </span>
              {screen.tokens.map((k) => (
                <span key={k} className="a2-var">{`{${k}}`}</span>
              ))}
              <p className="a2-xs a2-mute a2-mt6">{x('tokensHelp')}</p>
            </div>
            {MESSAGE_CHANNELS.filter((c) => open.rows.some((r) => r.channel === c) || open.missing.some((m) => m.channel === c)).map((c) => (
              <div key={c} className="a2-mt12" data-testid="tpl-channel" data-channel={c}>
                <h3 className="a2-h4" style={{ marginBottom: 8 }}>
                  {label(d, 'channel', c)}
                </h3>
                <div className="a2-row a2-r2" style={{ marginBottom: 0 }}>
                  {(['en', 'bn'] as const).map((l) => {
                    const row = open.rows.find((r) => r.channel === c && r.locale === l);
                    const miss = open.missing.find((m) => m.channel === c && m.locale === l);
                    if (row)
                      return (
                        <TemplateEditor
                          key={`${row.id}-${row.version}`}
                          dict={md}
                          row={{ id: row.id, channel: row.channel, locale: row.locale, body: row.body, subject: row.subject, version: row.version, providerStatus: row.providerStatus, edited: row.edited }}
                          sample={screen.sample}
                          hasHost={screen.hasHost}
                          canEdit={can}
                        />
                      );
                    if (miss) return <TemplateAdd key={`${c}-${l}`} dict={md} tplKey={open.key} channel={c} locale={l} draft={miss.draft} sample={screen.sample} hasHost={screen.hasHost} canEdit={can} langName={langName(l)} channelName={label(d, 'channel', c)} />;
                    return <div key={`${c}-${l}`} />;
                  })}
                </div>
              </div>
            ))}
            <p className="a2-xs a2-mute a2-mt12">{x('sampleNote')}</p>
          </section>
        ) : (
          <p className="a2-sm a2-mute">{x('pick')}</p>
        )}
      </div>
      <AutoReplyForm dict={md} config={screen.autoReply.config} version={screen.autoReply.version} templates={screen.groups.filter((g) => g.rows.some((r) => r.channel === 'WHATSAPP')).map((g) => g.key)} whenOptions={AUTO_REPLY_WHEN} canEdit={can} />
    </div>
  );
}
