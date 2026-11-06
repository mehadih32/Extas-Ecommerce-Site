// S02 · PR 83 — one A/B test as a card (Reports › Experiments, and the top of a test's own page): its name and state,
// what it counts and for how many visitors, the two versions side by side (visitors, who reached the goal, the rate),
// B against A and how sure that is, the verdict in words, what B changes, the preview links and its steps.
import Link from 'next/link';
import { eyeToggle } from '@extas/settings';
import { AB_PREVIEW_PARAM } from '@/lib/experiments/edge';
import type { TestRow } from '@/lib/experiments/admin';
import { defaultWord } from '@/lib/website/words';
import { ExperimentSteps, type StepButton } from './ExperimentSteps';

type G = (k: string, vars?: Record<string, string | number>) => string;

const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);

export function experimentSteps(r: TestRow, g: G): StepButton[] {
  if (r.archived) return [{ action: 'restore', label: g('step.restore'), ask: '' }];
  const keep: StepButton[] = !r.winner && r.verdict.winner ? [r.verdict.winner === 'b' ? { action: 'keep', winner: 'b', label: g('step.keepB'), ask: g('stepAsk.keepB'), primary: true } : { action: 'keep', winner: 'a', label: g('step.keepA'), ask: g('stepAsk.keepA'), primary: true }] : [];
  if (r.status === 'DRAFT') return [{ action: 'start', label: g('step.start'), ask: g('stepAsk.start'), primary: true }, { action: 'archive', label: g('step.archive'), ask: g('stepAsk.archive') }];
  if (r.status === 'RUNNING') return [...keep, { action: 'pause', label: g('step.pause'), ask: '' }, { action: 'end', label: g('step.end'), ask: g('stepAsk.end') }];
  if (r.status === 'PAUSED') return [...keep, { action: 'start', label: g('step.start'), ask: g('stepAsk.start') }, { action: 'end', label: g('step.end'), ask: g('stepAsk.end') }];
  return [...keep, { action: 'archive', label: g('step.archive'), ask: g('stepAsk.archive') }];
}

function verdictText(r: TestRow, g: G, need: number, min: number): string {
  if (r.winner === 'b') return g('verdict.keptB');
  if (r.winner === 'a') return g('verdict.keptA');
  if (r.status === 'DRAFT') return g('verdict.draft');
  const v = r.verdict;
  const c = v.confidence === null ? 0 : Math.floor(v.confidence * 100);
  if (r.status === 'ENDED' && !v.winner) return g('verdict.ended');
  if (!v.enough) return g('verdict.wait', { n: min });
  if (v.winner) return g(`verdict.${v.winner}`, { c });
  return g('verdict.notSure', { c, need });
}

export function ExperimentCard(p: { r: TestRow; g: G; lang: 'en' | 'bn'; eyeLabels: Record<string, string>; need: number; min: number; canWrite: boolean; api: string; href?: string; shopHome: string }) {
  const { r, g } = p;
  const tone = r.status === 'RUNNING' ? 'ok' : r.status === 'PAUSED' ? 'warn' : 'line';
  const conf = r.verdict.confidence === null ? null : Math.floor(r.verdict.confidence * 100);
  const until = r.endsOn ? g('untilDay', { day: r.endsOn }) : g('untilEnd');
  const rows: [string, { n: number; c: number }, number | null][] = [
    [g('verA'), r.a, r.verdict.rateA],
    [g('verB'), r.bTally, r.verdict.rateB],
  ];
  const sep = p.shopHome.includes('?') ? '&' : '?';
  const err = Object.fromEntries(['INVALID_INPUT', 'STALE', 'MODULE_OFF', 'CLASH', 'NOT_DRAFT', 'NOT_ALLOWED', 'NOT_SURE', 'NOT_FOUND', 'forbidden', 'UNAUTHENTICATED', 'unauthorized', 'READ_ONLY_ACCOUNT', 'network', 'other'].map((k) => [k, g(`err.${k}`)]));
  return (
    <section className="a2-sc a2-mt12 xpb-card" data-testid="xp-test" data-status={r.status}>
      <div className="xpb-head">
        <h3 className="a2-h3 xpb-name">{p.href ? <Link className="a2-lnk" href={p.href}>{r.name}</Link> : r.name}</h3>
        <span className={`a2-pill ${tone}`} data-testid="xp-status">
          {g(`status.${r.status}`)}
        </span>
        {r.archived ? <span className="a2-pill line">{g('archived')}</span> : null}
      </div>
      <p className="a2-xs a2-mute xpb-mt6">{g('goalLine', { goal: g(`goal.${r.goal}`), share: r.shareB, until })}</p>
      {r.note ? <p className="a2-sm xpb-mt6">{r.note}</p> : null}
      {r.timeUp ? <p className="a2-xs xpb-warn xpb-mt6">{g('timeUp')}</p> : null}
      <div className="a2-tblw a2-mt12">
        <table className="a2-tbl xpb-tbl">
          <thead>
            <tr>
              <th scope="col">{g('col.version')}</th>
              <th scope="col" className="xpb-r">{g('col.visitors')}</th>
              <th scope="col" className="xpb-r">{g('col.reached')}</th>
              <th scope="col" className="xpb-r">{g('col.rate')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, t, rate]) => (
              <tr key={label}>
                <td className="a2-tdh">
                  <b>{label}</b>
                </td>
                <td className="xpb-r a2-num" data-l={g('col.visitors')}>
                  {t.n}
                </td>
                <td className="xpb-r a2-num" data-l={g('col.reached')}>
                  {t.c}
                </td>
                <td className="xpb-r a2-num" data-l={g('col.rate')}>
                  {pct(rate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="xpb-sure a2-mt12">
        <span className="a2-sm">{g('lift', { v: r.verdict.lift === null ? '—' : `${r.verdict.lift >= 0 ? '+' : ''}${pct(r.verdict.lift)}` })}</span>
        <span className="xpb-meter" aria-hidden="true">
          <i className={conf !== null && conf >= p.need ? 'ok' : ''} style={{ width: `${Math.max(2, conf ?? 0)}%` }} />
        </span>
        <span className="a2-sm">{conf === null ? g('conf', { v: '—' }) : g('conf', { v: `${conf}%` })}</span>
        <span className="a2-xs a2-mute">{g('need', { need: p.need })}</span>
      </div>
      <p className="a2-sm xpb-mt6" data-testid="xp-verdict">
        {verdictText(r, g, p.need, p.min)}
      </p>
      <h4 className="a2-xs a2-mute xpb-mt12">{g('changes')}</h4>
      <ul className="xpb-changes" data-testid="xp-changes">
        {Object.entries(r.b.eye).map(([id, shown]) => (
          <li key={id}>{g(shown ? 'changeShown' : 'changeHidden', { label: p.eyeLabels[id] ?? eyeToggle(id)?.id ?? id })}</li>
        ))}
        {Object.entries(r.b.words).map(([key, w]) => (
          <li key={key}>{g('changeWord', { shop: defaultWord(p.lang, key), text: w[p.lang] ?? w.en ?? w.bn ?? '' })}</li>
        ))}
      </ul>
      <div className="a2-gap8 xpb-wrap a2-mt12">
        {p.href ? (
          <Link className="a2-btn" href={p.href} data-testid="xp-open">
            {r.status === 'DRAFT' && p.canWrite ? g('edit') : g('open')}
          </Link>
        ) : null}
        <a className="a2-btn" href={`${p.shopHome}${sep}${AB_PREVIEW_PARAM}=${r.id}.a`} target="_blank" rel="noopener noreferrer" data-testid="xp-preview-a">
          {g('previewA')}
        </a>
        <a className="a2-btn" href={`${p.shopHome}${sep}${AB_PREVIEW_PARAM}=${r.id}.b`} target="_blank" rel="noopener noreferrer" data-testid="xp-preview-b">
          {g('previewB')}
        </a>
      </div>
      {p.canWrite ? <ExperimentSteps api={`${p.api}/${r.id}`} version={r.version} steps={experimentSteps(r, g)} err={err} done={g('done')} testId="xp-steps" /> : null}
    </section>
  );
}
