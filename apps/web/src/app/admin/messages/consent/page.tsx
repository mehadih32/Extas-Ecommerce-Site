// S14 · PR 298 — Messages → Channels & limits → Consent (B5.7; BACKEND-ARCHITECTURE §8.8): who stopped which messages.
// The last 30 days (stops, starts, offers said no to), one number's answers per channel (every message; offers) with
// its history, the newest answers of every customer, the team's record of a customer's own stop or start (at his
// request), and the stop words with their rules. The engine checks these answers before every send. Seeing needs
// `messages.consent.view` (customers' numbers), recording and saving `messages.consent.write` (the API checks it again).
// Nothing on this page sends a message.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as ms from '@extas/messages';
import { CONSENT_STOP_CHANNELS, CONSENT_STOP_COVERS, JOURNEY_STEPS, MESSAGE_CHANNELS } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ConsentForm, ConsentRecordForm } from '@/components/admin/messages/ConsentForm';
import { formatNumber } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { label, msgError, withMessages } from '@/lib/admin-messages/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { messagesDeps } from '@/lib/messages-api';
import '../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/messages/consent';
const KEY = 'messagesConsent';

export async function generateMetadata(): Promise<Metadata> {
  const view = withMessages(await adminView());
  return { title: `${t(view.dict, 'msg.consent.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

const answerTone = (v: boolean | null) => (v === null ? 'line' : v ? 'ok' : 'bad');

export default async function ConsentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('messages.consent.view', deps, MOTHER_STORE_ID), searchParams]);
  const view = withMessages(plain);
  const d = view.dict;
  const raw = typeof sp.phone === 'string' ? sp.phone.slice(0, 40) : '';
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(raw ? `${HERE}?phone=${encodeURIComponent(raw)}` : HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="messages.consent.view" />
      </div>
    );
  const who: ms.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const md = await messagesDeps(access.deps);
  let badPhone: string | null = null;
  let screen: ms.ConsentScreen;
  try {
    screen = await ms.consentScreen(md, who, { phone: raw });
  } catch (e) {
    if (!ms.isMessagesError(e) || e.code !== 'INVALID_INPUT') throw e;
    badPhone = msgError({ msg: d.msg as Dict }, 'INVALID_INPUT', e.details.join(', '));
    screen = await ms.consentScreen(md, who);
  }
  const mdict: Dict = { msg: d.msg as Dict };
  const n = (x: number) => formatNumber(x, view.locale);
  const x = (k: string, v: Record<string, string> = {}) => t(d, `msg.consent.${k}`, v);
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' });
  const answer = (v: boolean | null, kind: 'all' | 'offers') => x(`answer.${kind}.${v === null ? 'none' : v ? 'yes' : 'no'}`);
  const source = (s: string) => [`msg.consent.source.${s}`].map((k) => [k, t(d, k)]).find(([k, v]) => k !== v)?.[1] ?? s;
  const rowsTable = (rows: ms.ConsentRow[], testId: string) => (
    <div className="a2-tblw a2-mt12" data-testid={testId}>
      <table className="a2-tbl">
        <thead>
          <tr>
            <th>{x('col.who')}</th>
            <th>{x('col.what')}</th>
            <th>{x('col.from')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-testid="consent-row" data-granted={String(r.granted)} data-scope={r.scope}>
              <td className="a2-tdh">
                <div className="a2-cell">
                  {r.phone ? (
                    <Link className="a2-lnk a2-mono a2-nowrap" href={`${HERE}?phone=${encodeURIComponent(r.phone)}`}>
                      {r.phone}
                    </Link>
                  ) : (
                    <span className="a2-faint">{t(d, 'msg.none')}</span>
                  )}
                  <span className="a2-xs a2-mute">{when.format(new Date(r.createdAt))}</span>
                </div>
              </td>
              <td data-l={x('col.what')}>
                <div className="a2-cell">
                  <span>
                    <span className={`a2-pill ${r.granted ? 'ok' : 'bad'}`}>{x(`row.${r.scope === 'ALL' ? 'all' : 'offers'}.${r.granted ? 'yes' : 'no'}`)}</span>
                  </span>
                  <span className="a2-xs a2-mute">{label(d, 'channel', r.channel)}</span>
                </div>
              </td>
              <td data-l={x('col.from')}>
                <div className="a2-cell">
                  <span className="a2-xs">{source(r.source)}</span>
                  {r.recordedBy ? <span className="a2-xs a2-mute">{x('by', { name: r.recordedBy })}</span> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="a2-z" data-testid="messages-consent">
      <PageHead view={view} place={locateKey(KEY)} title={x('title')} sub={x('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-kpis k6 a2-mt12" data-testid="consent-counts">
        {(
          [
            ['stops', screen.counts.stops],
            ['starts', screen.counts.starts],
            ['offersNo', screen.counts.offersNo],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="a2-kpi">
            <span className="a2-kl">{x(`kpi.${k}`)}</span>
            <span className="a2-kv">{n(v)}</span>
          </div>
        ))}
      </div>
      <section className="a2-sc a2-mt12" aria-labelledby="mc-look" data-testid="consent-lookup">
        <div className="a2-sch">
          <div>
            <h2 className="a2-h3" id="mc-look">
              {x('lookup')}
            </h2>
            <p className="a2-scd">{x('lookupHelp')}</p>
          </div>
        </div>
        <form className="a2-fbar a2-mt12" method="get" action={HERE} role="search">
          <label className="a2-lbl" htmlFor="mc-phone">
            {x('phone')}
          </label>
          <input id="mc-phone" name="phone" className="a2-inp" inputMode="tel" autoComplete="off" defaultValue={raw} data-testid="consent-phone" />
          <button type="submit" className="a2-btn">
            {x('find')}
          </button>
        </form>
        {badPhone ? (
          <p className="a2-xs a2-mt6" role="alert" style={{ color: 'var(--bad)' }}>
            {badPhone}
          </p>
        ) : null}
        {screen.lookup ? (
          <div className="a2-mt12" data-testid="consent-states">
            <p className="a2-sm">
              <b className="a2-mono">{screen.lookup.phone}</b> · {screen.lookup.customer ? x('hasAccount') : x('noAccount')}
            </p>
            <div className="a2-stack a2-mt6" style={{ gap: 8 }}>
              {screen.lookup.states.map((s) => (
                <div key={s.channel} className="a2-rule" data-testid="consent-state" data-channel={s.channel} data-all={String(s.all)} data-offers={String(s.offers)}>
                  <b>{label(d, 'channel', s.channel)}</b>
                  <span className="a2-gap8">
                    <span className={`a2-pill ${s.all === false ? 'bad' : 'ok'}`}>{answer(s.all, 'all')}</span>
                    <span className={`a2-pill ${answerTone(s.offers)}`}>{answer(s.offers, 'offers')}</span>
                  </span>
                </div>
              ))}
            </div>
            {screen.lookup.history.length ? rowsTable(screen.lookup.history, 'consent-history') : <p className="a2-xs a2-mute a2-mt6">{x('noHistory')}</p>}
          </div>
        ) : null}
      </section>
      {screen.perms.write ? <ConsentRecordForm dict={mdict} phone={screen.lookup?.phone ?? ''} channels={MESSAGE_CHANNELS} /> : null}
      <section className="a2-sc a2-mt12" aria-labelledby="mc-recent">
        <div className="a2-sch">
          <div>
            <h2 className="a2-h3" id="mc-recent">
              {x('recent')}
            </h2>
            <p className="a2-scd">{x('recentHelp')}</p>
          </div>
        </div>
        {screen.recent.length ? (
          rowsTable(screen.recent, 'consent-recent')
        ) : (
          <p className="a2-xs a2-mute a2-mt12" data-testid="consent-empty">
            {x('empty')}
          </p>
        )}
      </section>
      <ConsentForm dict={mdict} config={screen.config} version={screen.version} canEdit={screen.perms.write} choices={{ covers: CONSENT_STOP_COVERS, stopChannels: CONSENT_STOP_CHANNELS, steps: JOURNEY_STEPS, channels: MESSAGE_CHANNELS }} />
    </div>
  );
}
