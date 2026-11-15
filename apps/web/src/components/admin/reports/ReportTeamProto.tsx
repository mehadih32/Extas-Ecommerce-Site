// PR 798 (prototype v5 Reports › Team): the report as the prototype draws it — the answers box, four figures and three chips, the leaderboard,
// work by type (calls against packing and handover, per person) and the team table whose row opens what the person did, order by order.
// Server component; figures from lib/reports-v5/team.ts.
import Link from 'next/link';
import { SummaryTiles, type SummaryTile } from '../lumen/SummaryTiles';
import { ReportAnswers, type AnswerLine } from './ReportAnswers';
import { SortTable, type STRow } from './SortTable';
import type { ReportFmt } from '@/lib/reports-v5/fmt';
import { change } from '@/lib/reports-v5/model';
import { avg, emptyAct, total, type Act, type TeamData } from '@/lib/reports-v5/team';
import './report-answers.css';
import './report-areas.css';

type C = (k: string, v?: Record<string, string | number>) => string;
const sgn = (x: number | null) => (x === null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`);
const sumOf = (m: ReadonlyMap<string, Act>, k: 'confirm' | 'pack' | 'hand' | 'msgs') => [...m.values()].reduce((n, a) => n + a[k], 0);
const SLOW_CONFIRM_HOURS = 3; // hardcode-ok: the prototype turns the confirm line red above 3 hours
const SLOW_REPLY_MIN = 20; // hardcode-ok: the prototype turns the reply line red above 20 minutes

export function ReportTeamProto({ data, cmp, c, f, locale, dt }: { data: TeamData; cmp: boolean; c: C; f: ReportFmt; locale: string; dt: (ms: number) => string }) {
  const { people, cur, prev, conv, convPrev } = data;
  const act = (id: string) => cur.get(id) ?? emptyAct();
  const rows = people.map((p) => ({ p, a: act(p.id), total: total(act(p.id)), ptotal: total(prev.get(p.id) ?? emptyAct()), rt: avg(act(p.id).rt), ct: avg(act(p.id).ct), cv: conv.get(p.id) ?? { chats: 0, orders: 0 } }));
  const lead = [...rows].sort((a, b) => b.total - a.total);
  const allRt = rows.flatMap((x) => x.a.rt);
  const allCt = rows.flatMap((x) => x.a.ct);
  const sum = (m: ReadonlyMap<string, { chats: number; orders: number }>) => ({ chats: [...m.values()].reduce((n, x) => n + x.chats, 0), orders: [...m.values()].reduce((n, x) => n + x.orders, 0) });
  const ca = sum(conv);
  const cq = sum(convPrev);
  const rate = (x: { chats: number; orders: number }) => (x.chats ? (x.orders / x.chats) * 100 : 0);
  const pct0 = (x: number) => `${Math.round(x)}%`;
  const hrs = (x: number) => c('hours', { n: x.toFixed(1) });
  const mins = (m: number) => (m ? (m >= 60 ? c('hours', { n: (m / 60).toFixed(1) }) : c('minutes', { n: Math.round(m) })) : '—');
  const dl = (x: number | null) => (cmp ? x : undefined);
  const nf = { kind: 'number', locale } as const;

  const lines: AnswerLine[] = [];
  if (lead[0] && lead[0].total) lines.push({ text: c('ans.lead', { name: lead[0].p.name, n: f.num(lead[0].total), chg: sgn(change(lead[0].total, lead[0].ptotal)) }), tone: 'good', act: { label: c('ans.inbox'), href: '/admin/support' } });
  if (allCt.length || data.newWaiting) lines.push({ text: c('ans.confirm', { h: avg(allCt).toFixed(1), n: f.num(data.newWaiting) }), tone: avg(allCt) > SLOW_CONFIRM_HOURS ? 'bad' : undefined, act: { label: c('ans.processing'), href: '/admin/orders/confirm' } });
  if (allRt.length) lines.push({ text: c('ans.reply', { m: Math.round(avg(allRt)), n: f.num(data.unassigned) }), tone: avg(allRt) > SLOW_REPLY_MIN ? 'bad' : undefined, act: { label: c('ans.openInbox'), href: '/admin/support' } });

  const tiles: SummaryTile[] = [
    { key: 'confirm', label: c('kConfirm'), value: sumOf(cur, 'confirm'), shown: f.num(sumOf(cur, 'confirm')), format: nf, delta: dl(change(sumOf(cur, 'confirm'), sumOf(prev, 'confirm'))) },
    { key: 'pack', label: c('kPack'), value: sumOf(cur, 'pack'), shown: f.num(sumOf(cur, 'pack')), format: nf, delta: dl(change(sumOf(cur, 'pack'), sumOf(prev, 'pack'))) },
    { key: 'chat', label: c('kChat'), value: rate(ca), shown: pct0(rate(ca)), format: nf, delta: dl(change(rate(ca), rate(cq))), vs: c('kChatSub', { o: f.num(ca.orders), n: f.num(ca.chats) }) },
    { key: 'rt', label: c('kReply'), value: avg(allRt), shown: mins(avg(allRt)), format: nf, vs: c('kReplySub') },
  ];

  const max = Math.max(1, ...rows.map((x) => Math.max(x.a.confirm + x.a.cancel, x.a.pack + x.a.hand)));
  const kindWord = (k: string) => c(`log.${k}`);
  const table: STRow[] = rows.map((x) => ({
    key: x.p.id,
    cells: [
      <span key="n">
        <b>{x.p.name}</b>
        <span className="a2-xs a2-mute a2-blk">{x.p.role ?? '—'}</span>
      </span>,
      f.num(x.a.confirm),
      f.num(x.a.cancel),
      f.num(x.a.pack),
      f.num(x.a.exch),
      f.num(x.a.msgs),
      x.cv.chats ? (
        <span key="c">
          {pct0(rate(x.cv))}
          <span className="a2-xs a2-mute a2-blk">
            {x.cv.orders}/{x.cv.chats}
          </span>
        </span>
      ) : (
        '—'
      ),
      mins(x.rt),
      <b key="t">{x.total}</b>,
    ],
    sort: [x.p.name, x.a.confirm, x.a.cancel, x.a.pack, x.a.exch, x.a.msgs, x.cv.chats ? rate(x.cv) : 0, x.rt || 1e9, x.total],
    drawer: {
      title: `${x.p.name} · ${c('recentWork')}`,
      items: [...x.a.log].sort((a, b) => b.at - a.at).slice(0, 40).map((l) => ({ label: `${kindWord(l.kind)} ${l.label}`, sub: dt(l.at), href: l.orderId ? `/admin/orders/${l.orderId}` : undefined })), // hardcode-ok: the prototype lists the last 40 actions
      empty: c('noWork'),
    },
  }));

  return (
    <div data-testid="team-proto">
      <ReportAnswers kicker={c('answers')} question={c('ans.q')} lines={lines} empty={c('ansNone')} />
      <SummaryTiles className="a2-mt12" tiles={tiles} label={c('tilesLabel')} testId="team-proto-tiles" />
      <div className="rp-ks" data-testid="team-chips">
        <div>
          <span>{c('kHand')}</span>
          <b>{f.num(sumOf(cur, 'hand'))}</b>
          {cmp ? <span>{sgn(change(sumOf(cur, 'hand'), sumOf(prev, 'hand')))}</span> : null}
        </div>
        <div>
          <span>{c('kMsgs')}</span>
          <b>{f.num(sumOf(cur, 'msgs'))}</b>
          {cmp ? <span>{sgn(change(sumOf(cur, 'msgs'), sumOf(prev, 'msgs')))}</span> : null}
        </div>
        <div>
          <span>{c('kConfirmTime')}</span>
          <b>{allCt.length ? hrs(avg(allCt)) : '—'}</b>
          <span>{c('kConfirmSub')}</span>
        </div>
      </div>

      <div className="rp-grid2 a2-mt12">
        <section className="a2-card" data-testid="tm-board">
          <h2 className="a2-h3">{c('boardTitle')}</h2>
          <p className="a2-cs">{c('boardSub')}</p>
          {lead.length ? (
            <ul className="cr-rows">
              {lead.map((x, i) => (
                <li key={x.p.id}>
                  <div>
                    <span className={`rp-rank${i === 0 && x.total ? ' first' : ''}`}>{i + 1}</span> <b>{x.p.name}</b>
                    <span className="a2-xs a2-mute a2-blk">{x.p.role ?? '—'}</span>
                    <span className="rpb-t" style={{ display: 'block' }}>
                      <i style={{ width: `${Math.max(2, Math.round((x.total / Math.max(1, lead[0]!.total)) * 100))}%` }} />
                    </span>
                  </div>
                  <b>{x.total}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{c('noPeople')}</p>
          )}
        </section>
        <section className="a2-card" data-testid="tm-types">
          <h2 className="a2-h3">{c('typeTitle')}</h2>
          <div className="rpc" role="list">
            {rows.map((x) => (
              <div key={x.p.id} className="rpc-c" role="listitem" title={`${x.p.name}: ${x.a.confirm + x.a.cancel} / ${x.a.pack + x.a.hand}`}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: '100%', width: '100%', justifyContent: 'center' }}>
                  <i style={{ height: `${Math.max(2, Math.round(((x.a.confirm + x.a.cancel) / max) * 100))}%`, background: 'var(--lm-warn)', maxWidth: 14 }} />
                  <i style={{ height: `${Math.max(2, Math.round(((x.a.pack + x.a.hand) / max) * 100))}%`, maxWidth: 14 }} />
                </div>
                <span>{x.p.name.split(' ')[0]}</span>
              </div>
            ))}
          </div>
          <div className="rpl-leg">
            <span>
              <i className="rp-dot" style={{ background: 'var(--lm-warn)' }} /> {c('typeCalls')}
            </span>
            <span>
              <i className="rp-dot" style={{ background: 'var(--lm-ac)' }} /> {c('typePack')}
            </span>
          </div>
          <p className="a2-xs a2-mute a2-mt6">
            {c('typeNote')}{' '}
            <Link className="cr-link" href="/admin/marketing/report">
              {c('typeLink')}
            </Link>
          </p>
        </section>
      </div>

      <section className="a2-card a2-mt12" data-testid="tm-table">
        <h2 className="a2-h3">{c('tableTitle')}</h2>
        <p className="a2-cs">{c('tableSub')}</p>
        <SortTable
          cols={[{ h: c('colPerson') }, { h: c('kConfirm'), right: true }, { h: c('colCancelled'), right: true, hide: true }, { h: c('colPacked'), right: true }, { h: c('colExch'), right: true, hide: true }, { h: c('colMsgs'), right: true }, { h: c('kChat'), right: true }, { h: c('colReply'), right: true, hide: true }, { h: c('colTotal'), right: true }]}
          rows={table}
          sortCol={8}
          limit={12}
          texts={{ more: c('showAll'), less: c('showLess'), close: c('close'), empty: c('noPeople') }}
          testId="tm-table-t"
          rowId="tm-row"
        />
      </section>
    </div>
  );
}
