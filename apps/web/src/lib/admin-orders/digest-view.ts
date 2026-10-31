// S06 · PR 540 — Orders › Today's digest: the screen model of one approval digest (@extas/orders approvalDigest), built on
// the server with the page's words (messages/admin-digest.*.json, `dg.*`). The engine's report in one sentence ("Orders on 31
// Oct: 50; 30 confirmed and moved on; 5 held (risk check: 3, …); 10 had another order running, 8 of those look like
// duplicates"), the figures, held and cancelled by reason, and what waits for a person's OK — proposed holds, reviews,
// one-parcel proposals, blocklist proposals — each row linking to its order. Nothing here acts.
import type { ApprovalDigest, DigestCount, DigestList } from '@extas/orders';
import { orderHref } from './model';

export type Words = (key: string, vars?: Record<string, string | number>) => string;

export interface DigestFormat {
  w: Words;
  num: (n: number) => string;
  pct: (share: number) => string;
  when: (iso: string) => string;
  /** The shop day as words. */
  day: string;
  /** The owner's words of a hold reason key and of a cancel code (or the key). */
  holdReason: (key: string) => string;
  cancelReason: (code: string) => string;
}

export interface DigestKpi {
  id: 'placed' | 'movedOn' | 'toConfirm' | 'held' | 'running';
  label: string;
  value: string;
  foot: string;
}

export interface DigestWaitList {
  id: 'holds' | 'reviews' | 'bundles';
  title: string;
  desc: string;
  /** How many wait in all, as words. */
  count: string;
  cols: string[];
  rows: { key: string; href: string; number: string; cells: string[] }[];
  more: string | null;
}

export interface DigestScreen {
  headline: string;
  kpis: DigestKpi[];
  held: { name: string; count: string }[];
  cancelled: { name: string; count: string }[];
  gateNote: string;
  waits: DigestWaitList[];
  blocks: string;
}

const total = (rows: DigestCount[]) => rows.reduce((a, r) => a + r.count, 0);

export function digestScreen(g: ApprovalDigest, f: DigestFormat): DigestScreen {
  const { w, num } = f;
  const heldN = total(g.held);
  const cancelledN = total(g.cancelled);
  const reasonName = (key: string, name: (k: string) => string) => (key ? name(key) : w('noReason'));
  const held = g.held.map((r) => ({ name: reasonName(r.key, f.holdReason), count: num(r.count) }));
  const cancelled = g.cancelled.map((r) => ({ name: reasonName(r.key, f.cancelReason), count: num(r.count) }));
  // the engine's report, one sentence: only the parts that have something to say
  const parts = g.placed
    ? [
        w('head.placed', { n: num(g.placed), day: f.day }),
        w('head.movedOn', { n: num(g.movedOn) }),
        ...(g.toConfirm ? [w('head.toConfirm', { n: num(g.toConfirm) })] : []),
        ...(heldN ? [w('head.held', { n: num(heldN), reasons: held.map((r) => w('head.reason', { name: r.name, n: r.count })).join(', ') })] : []),
        ...(cancelledN ? [w('head.cancelled', { n: num(cancelledN) })] : []),
        ...(g.running ? [w('head.running', { n: num(g.running), dup: num(g.duplicates) })] : []),
      ]
    : [w('head.none', { day: f.day })];
  const kpis: DigestKpi[] = [
    { id: 'placed', label: w('kpi.placed'), value: num(g.placed), foot: w('kpi.placedFoot') },
    { id: 'movedOn', label: w('kpi.movedOn'), value: num(g.movedOn), foot: g.placed ? w('kpi.movedOnFoot', { pct: f.pct(g.movedOn / g.placed) }) : '—' },
    { id: 'toConfirm', label: w('kpi.toConfirm'), value: num(g.toConfirm), foot: w('kpi.toConfirmFoot', { n: num(g.awaitingAdvance) }) },
    { id: 'held', label: w('kpi.held'), value: num(heldN), foot: w('kpi.heldFoot') },
    { id: 'running', label: w('kpi.running'), value: num(g.running), foot: w('kpi.runningFoot', { n: num(g.duplicates) }) },
  ];
  const more = (l: DigestList) => (l.total > l.rows.length ? w('more', { shown: num(l.rows.length), total: num(l.total) }) : null);
  const waits: DigestWaitList[] = [
    {
      id: 'holds',
      title: w('holds.h'),
      desc: w('holds.d'),
      count: num(g.holds.total),
      cols: ['order', 'rule', 'holdReason', 'when'].map((c) => w(`col.${c}`)),
      rows: g.holds.rows.map((r) => ({ key: r.orderId, href: orderHref(r.orderId), number: r.number, cells: [r.what ? w(`rule.${r.what}`) : '—', r.reasonKey ? f.holdReason(r.reasonKey) : '—', f.when(r.at)] })),
      more: more(g.holds),
    },
    {
      id: 'reviews',
      title: w('reviews.h'),
      desc: w('reviews.d'),
      count: num(g.reviews.total),
      cols: ['order', 'proposed', 'sure', 'when'].map((c) => w(`col.${c}`)),
      rows: g.reviews.rows.map((r) => ({ key: r.orderId, href: orderHref(r.orderId), number: r.number, cells: [r.what ? w(`action.${r.what}`) : '—', r.confidence === null ? '—' : w('sure', { n: num(r.confidence) }), f.when(r.at)] })),
      more: more(g.reviews),
    },
    {
      id: 'bundles',
      title: w('bundles.h'),
      desc: w('bundles.d'),
      count: num(g.bundles.total),
      cols: ['order', 'when'].map((c) => w(`col.${c}`)),
      rows: g.bundles.rows.map((r) => ({ key: r.orderId, href: orderHref(r.orderId), number: r.number, cells: [f.when(r.at)] })),
      more: more(g.bundles),
    },
  ];
  return {
    headline: `${parts.join('; ')}${w('head.stop')}`,
    kpis,
    held,
    cancelled,
    gateNote: w(g.gate ? 'gate.on' : 'gate.off'),
    waits,
    blocks: g.blockProposals ? w('blocks.line', { n: num(g.blockProposals) }) : w('blocks.none'),
  };
}
