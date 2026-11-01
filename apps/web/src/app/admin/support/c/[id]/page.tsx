// S22 · PR 425 — one conversation (Support › Inbox › a conversation; Blueprint B4.4): every message in order — the
// customer's on the left, the shop's replies on the right with who sent them and whether they went out, internal notes
// in the note colour — with their files; the box to reply or write a note; beside it the state, who has it, the
// customer and the linked order, and the who-did-what log. On a phone and a tablet "Conversation" and "Details & log"
// are two tabs; on a computer they sit side by side. The order panel with the customer's history is PR 428.
// PR 427: "Same person" — this person's other chats (other channels, earlier chats) and, with `support.identity`, the
// chat's number set by hand, "Not this customer" and "Not the same person".
//
// `support.read` opens it; replying, notes, taking it and the state need `support.reply`, giving it to someone else
// `support.assign` (the API checks again). Nothing here moves money or changes an order.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sp from '@extas/support';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { DetailGrid } from '@/components/admin/orders/OrderCommands';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { Composer, type ComposerTexts } from '@/components/admin/support/Composer';
import { IdentityActions, type IdentityTexts } from '@/components/admin/support/IdentityActions';
import { SideActions, type SideTexts } from '@/components/admin/support/SideActions';
import { formatNumber } from '@/components/admin/products/model';
import { printedAt } from '@/lib/admin-fulfil/handover';
import { adminDeps } from '@/lib/admin-auth';
import { kindName, logLine, senderLabel, withInbox } from '@/lib/admin-support/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { supportDeps } from '@/lib/support-api';
import '../../support.css';

export const dynamic = 'force-dynamic';

const API = '/api/admin/support';

export async function generateMetadata(): Promise<Metadata> {
  const view = withInbox(await adminView());
  return { title: `${t(view.dict, 'sup.th.main')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

const ERR_CODES = ['STALE', 'EMPTY', 'TOO_LONG', 'FILES_OFF', 'TOO_MANY_FILES', 'FILE_NOT_ALLOWED', 'TOO_LARGE', 'NOT_ASSIGNABLE', 'IDEMPOTENCY_MISMATCH', 'NOT_FOUND', 'INVALID_INPUT', 'FORBIDDEN', 'UNAUTHENTICATED', 'network', 'other'];
const errs = (d: Dict) => Object.fromEntries(ERR_CODES.map((c) => [c, t(d, `sup.err.${c}`)]));
const deliveryTone = (s: string | null) => (s === 'SENT' ? 'ok' : s === 'FAILED' ? 'bad' : s === 'NOT_SENT' ? 'warn' : 'line');
const statusTone = (s: string) => (s === 'OPEN' ? 'warn' : s === 'SOLVED' ? 'ok' : 'info');

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const here = `/admin/support/c/${id}`;
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('support.read', deps, MOTHER_STORE_ID)]);
  const view = withInbox(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="supportConversation" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="support.read" />
      </div>
    );
  const who: sp.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const sd = supportDeps(access.deps);
  let th: sp.Thread;
  try {
    th = await sp.supportThread(sd, who, id);
  } catch (e) {
    if (sp.isSupportError(e) && e.code === 'NOT_FOUND')
      return (
        <div className="a2-z">
          <ShellState view={view} kind="notfound" />
        </div>
      );
    throw e;
  }
  const r = access.deps.resolver;
  const [staff, files, inbox] = await Promise.all([th.you.assign ? sp.supportStaff(sd, who) : Promise.resolve([]), r.value('support.attachments', { storeId: MOTHER_STORE_ID }), r.value('support.inbox', { storeId: MOTHER_STORE_ID })]);
  const n = (x: number) => formatNumber(x, view.locale);
  const at = (x: Date | null) => (x ? printedAt(x.toISOString(), view.timeZone) : t(d, 'sup.side.none'));
  const name = th.contact.name ?? th.contact.phone ?? t(d, 'sup.unnamed');
  const accept = [files.kinds.image ? 'image/jpeg,image/png,image/webp,image/gif' : '', files.kinds.video ? 'video/mp4,video/quicktime,video/webm' : '', files.kinds.pdf ? 'application/pdf' : ''].filter(Boolean).join(',');
  const reasons = Object.fromEntries(sp.NOT_SENT_REASONS.map((k) => [k, t(d, `sup.msg.reason.${k}`)]));
  const c = (k: string) => t(d, `sup.compose.${k}`);
  const composer: ComposerTexts = {
    label: c('label'),
    reply: c('reply'),
    note: c('note'),
    phReply: c('phReply'),
    phNote: c('phNote'),
    attach: c('attach'),
    send: c('send'),
    saveNote: c('saveNote'),
    sending: c('sending'),
    uploading: c('uploading'),
    remove: c('remove'),
    hint: c('hint'),
    sent: c('sent'),
    kept: c('kept'),
    noted: c('noted'),
    reasons,
    err: errs(d),
  };
  const s = (k: string) => t(d, `sup.side.${k}`);
  const side: SideTexts = { state: s('state'), solve: s('solve'), wait: s('wait'), reopen: s('reopen'), owner: s('owner'), take: s('take'), letGo: s('letGo'), give: s('give'), giveGo: s('giveGo'), nobody: s('nobody'), saved: s('saved'), err: errs(d) };
  const connected = Object.keys(sd.channels ?? {}).includes(th.channel.kind) && th.channel.enabled;
  const p = (k: string) => t(d, `sup.person.${k}`);
  const identityTexts: IdentityTexts = { phone: p('phone'), phoneHelp: p('phoneHelp'), phoneSave: p('phoneSave'), unlink: p('unlink'), split: p('split'), saved: p('saved'), badPhone: p('badPhone'), err: errs(d) };

  const main = (
    <>
      {!connected ? (
        <div className="a2-note warn" style={{ marginTop: 0 }} data-testid="support-not-connected">
          <ShellIcon name="info" size={15} />
          <span>{t(d, 'sup.th.notConnected')}</span>
        </div>
      ) : null}
      <section className="sp-thread" aria-label={t(d, 'sup.th.main')} data-testid="support-thread">
        {th.messages.length ? (
          th.messages.map((m) => {
            const cls = m.direction === 'IN' ? 'in' : m.direction === 'NOTE' ? 'note' : 'out';
            return (
              <article key={m.id} className={`sp-msg ${cls}`} data-testid="support-msg" data-direction={m.direction}>
                {m.body ? <div className="sp-bub">{m.body}</div> : null}
                {m.files.length ? (
                  <div className="sp-files">
                    {m.files.map((f) =>
                      !f.ready ? (
                        <span key={f.id} className="sp-file" data-testid="support-file-pending">
                          <ShellIcon name="clock" size={13} />
                          <span>{f.fileName ?? t(d, 'sup.msg.pending')}</span>
                        </span>
                      ) : f.kind === 'IMAGE' ? (
                        <a key={f.id} className="sp-file sp-pic" href={`${API}/files/${f.id}`} target="_blank" rel="noopener" aria-label={`${t(d, 'sup.msg.open')}: ${f.fileName ?? t(d, 'sup.msg.file')}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- our stored copy of a chat picture, behind the admin's login */}
                          <img src={`${API}/files/${f.id}`} alt={f.fileName ?? t(d, 'sup.msg.file')} loading="lazy" decoding="async" />
                        </a>
                      ) : (
                        <a key={f.id} className="sp-file" href={`${API}/files/${f.id}`} target="_blank" rel="noopener" data-testid="support-file">
                          <ShellIcon name="file" size={13} />
                          <span>{f.fileName ?? t(d, 'sup.msg.file')}</span>
                        </a>
                      ),
                    )}
                  </div>
                ) : null}
                <div className="sp-by">
                  {m.isNote ? (
                    <span className="a2-pill warn">
                      <ShellIcon name="lock" size={11} />
                      {t(d, 'sup.msg.note')}
                    </span>
                  ) : null}
                  <span>{senderLabel(d, m.sender.type, m.sender.name)}</span>
                  <span>· {printedAt(m.sentAt.toISOString(), view.timeZone)}</span>
                  {m.direction === 'OUT' && m.status ? <span className={`a2-pill ${deliveryTone(m.status)}`}>{t(d, `sup.msg.${m.status}`)}</span> : null}
                  {m.direction === 'OUT' && m.failReason ? <span>{t(d, 'sup.msg.why', { reason: reasons[m.failReason] ?? m.failReason })}</span> : null}
                </div>
              </article>
            );
          })
        ) : (
          <p className="a2-sm a2-mute">{t(d, 'sup.msg.empty')}</p>
        )}
      </section>
      {th.you.reply ? (
        <Composer url={`${API}/c/${th.id}/messages`} filesUrl={`${API}/files`} version={th.version} maxChars={inbox.replyMaxChars} files={{ enabled: files.enabled && accept !== '', max: files.maxPerMessage, accept }} texts={composer} />
      ) : (
        <p className="a2-note">
          <ShellIcon name="lock" size={15} />
          <span>{t(d, 'sup.compose.readOnly')}</span>
        </p>
      )}
    </>
  );

  const sideBox = (
    <>
      <section className="a2-card" aria-labelledby="sp-details" data-testid="support-details">
        <h2 className="a2-h4" id="sp-details" style={{ marginBottom: 10 }}>
          {t(d, 'sup.th.side')}
        </h2>
        <div className="sp-kv">
          <span>{s('state')}</span>
          <span>
            <span className={`a2-pill ${statusTone(th.status)}`}>{t(d, `sup.status.${th.status}`)}</span>
          </span>
          <span>{s('owner')}</span>
          <span>{th.assignedTo ? (th.assignedTo.id === th.you.id ? t(d, 'sup.you') : th.assignedTo.name) : t(d, 'sup.nobody')}</span>
          <span>{s('contact')}</span>
          <span>{th.contact.name ?? t(d, 'sup.unnamed')}</span>
          <span>{s('phone')}</span>
          <span className="a2-mono">{th.contact.phone ?? s('none')}</span>
          <span>{s('channel')}</span>
          <span>
            {kindName(d, th.channel.kind)} · {th.channel.name}
          </span>
          {th.customer ? (
            <>
              <span>{s('history')}</span>
              <span>{s('known').replace('{n}', n(th.customer.orderCount))}</span>
            </>
          ) : null}
          {th.order ? (
            <>
              <span>{s('order')}</span>
              <span>
                <Link className="a2-lnk" href={`/admin/orders/${th.order.id}`}>
                  {th.order.number}
                </Link>
              </span>
            </>
          ) : null}
          <span>{s('started')}</span>
          <span>{at(th.createdAt)}</span>
          <span>{s('firstReply')}</span>
          <span>{at(th.firstResponseAt)}</span>
          {th.resolvedAt ? (
            <>
              <span>{s('solvedAt')}</span>
              <span>{at(th.resolvedAt)}</span>
            </>
          ) : null}
        </div>
        <div className="a2-mt12">
          <SideActions base={`${API}/c/${th.id}`} version={th.version} status={th.status} assignedId={th.assignedTo?.id ?? null} me={th.you.id} canReply={th.you.reply} canAssign={th.you.assign} staff={staff} texts={side} />
        </div>
      </section>
      <section className="a2-card" aria-labelledby="sp-person" data-testid="support-person">
        <h2 className="a2-h4" id="sp-person">
          {p('h')}
        </h2>
        <p className="a2-xs a2-mute" style={{ margin: '4px 0 12px' }}>
          {p('d')}
        </p>
        {th.person.chats.length ? (
          <ul className="sp-same">
            {th.person.chats.map((x) => (
              <li key={x.id}>
                <Link className="sp-same-row" href={`/admin/support/c/${x.id}`} data-testid="support-person-chat">
                  <span>
                    {kindName(d, x.channel.kind)} · {x.channel.name}
                  </span>
                  <span className="a2-xs a2-mute">
                    {t(d, 'sup.th.ref', { ref: x.refCode })}
                    {x.lastMessageAt ? ` · ${printedAt(x.lastMessageAt.toISOString(), view.timeZone)}` : ''}
                  </span>
                  <span className={`a2-pill ${statusTone(x.status)}`}>{t(d, `sup.status.${x.status}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{p('none')}</p>
        )}
        {th.person.contacts > 1 ? <p className="a2-xs a2-mute a2-mt6">{p('contacts').replace('{n}', n(th.person.contacts))}</p> : null}
        {th.person.fixed ? (
          <p className="a2-xs a2-mute a2-mt6" data-testid="support-person-fixed" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <ShellIcon name="lock" size={11} /> {p('fixed')}
          </p>
        ) : null}
        {th.you.identity ? (
          <div className="a2-mt12">
            <IdentityActions url={`${API}/c/${th.id}/identity`} version={th.version} linked={!!th.customer} together={th.person.contacts > 1} texts={identityTexts} />
          </div>
        ) : null}
      </section>
      <section className="a2-card" aria-labelledby="sp-log" data-testid="support-log">
        <h2 className="a2-h4" id="sp-log">
          {t(d, 'sup.log.h')}
        </h2>
        <p className="a2-xs a2-mute" style={{ margin: '4px 0 12px' }}>
          {t(d, 'sup.log.d')}
        </p>
        <div className="a2-tl">
          {[...th.events].reverse().map((e) => (
            <div key={e.id} className={`a2-tli${e.kind === 'NOTED' ? ' warn' : e.kind === 'RECEIVED' || e.kind === 'REOPENED' ? ' mute' : ''}`} data-testid="support-log-line">
              <b>{logLine(d, e)}</b>
              <span>{printedAt(e.at.toISOString(), view.timeZone)}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );

  return (
    <div className="a2-z" data-testid="support-conversation">
      <PageHead
        view={view}
        place={locateKey('supportConversation')}
        crumb={
          <Link href="/admin/support">
            <ShellIcon name="cl" size={12} />
            {t(d, 'sup.th.back')}
          </Link>
        }
        title={name}
        sub={`${kindName(d, th.channel.kind)} · ${t(d, 'sup.th.ref', { ref: th.refCode })}`}
        right={<span className={`a2-pill ${statusTone(th.status)}`}>{t(d, `sup.status.${th.status}`)}</span>}
      />
      <SectionTabs view={view} current="supportConversation" />
      <div className="a2-mt12">
        <DetailGrid labels={{ aria: t(d, 'sup.th.aria'), main: t(d, 'sup.th.main'), side: t(d, 'sup.th.side') }} main={main} side={sideBox} />
      </div>
    </div>
  );
}
