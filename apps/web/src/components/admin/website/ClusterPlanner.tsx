'use client';
// S12 · PR 242 (Blueprint C4.5, C11.2; demo 94-admin-blog.js topics tab) — the topic plan's working parts: each
// cluster with its pillar and supporting articles (the links each still lacks), its topics (yes / no for the owner,
// "Start writing" makes the draft inside the cluster), the articles in no cluster, and the forms for a new topic (alike
// topics shown as you type; a very close one needs a second press) and a new cluster. Every change sends the version
// it was read at; nothing is deleted (put away / restore). Without `blog.write` it is read-only.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { alikeLevel, closest, type LinkGap } from '@/lib/journal/clusters-model';
import type { Plan, PlanCluster, PlanPost, PlanTopic } from '@/lib/journal/clusters';
import { call } from '../api';

type Said = { text: string; bad: boolean } | null;
const EDITOR = '/admin/website/blog';
/** PR 528: a topic's brief. */
const BRIEF = '/admin/website/blog/briefs';
/** An input field's word on the screen. */
const FIELD: Record<string, string> = { title: 'topic', clusterId: 'cluster', authorId: 'author', categoryId: 'category', targetPath: 'target', postId: 'pick' };

export function ClusterPlanner(p: { words: Dict; plan: Plan; canWrite: boolean; canPublish: boolean; lang: 'en' | 'bn'; part: 'queue' | 'clusters' | 'forms' }) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.words, `jr.${k}`, vars);
  const l = (k: string, vars?: Record<string, string | number>) => c(`pl.${k}`, vars);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said>(null);
  const [edit, setEdit] = useState<string | null>(null); // a cluster's id or 'new'
  const [cl, setCl] = useState<Record<string, string>>({});
  const [tp, setTp] = useState({ title: '', query: '', locale: p.lang as string, clusterId: '', priority: '2', isPillar: false, authorId: '' });
  const [force, setForce] = useState(false);
  const [pick, setPick] = useState<Record<string, string>>({});
  const plan = p.plan;
  const live = plan.clusters.filter((x) => !x.archived);

  function errText(a: { status: number; data: { error?: string; details?: string[] } }) {
    if (a.status === 0) return c('err.network');
    if (a.status === 401) return c('err.unauthorized');
    const k = `err.${a.data.error ?? 'other'}`;
    const d = a.data.details ?? [];
    const txt = c(k, { fields: a.data.error === 'ALIKE' ? d.join(', ') : d.map((f) => l(FIELD[f] ?? f)).join(', '), paths: d.join(', ') });
    return txt === `jr.${k}` ? c('err.other') : txt;
  }

  async function send(method: 'POST' | 'PUT', url: string, body: unknown, done?: (data: Record<string, unknown>) => void) {
    setBusy(true);
    const a = await call(method, url, body);
    setBusy(false);
    if (a.status === 200 || a.status === 201) {
      setSaid({ text: c('e.saved'), bad: false });
      done?.(a.data as Record<string, unknown>);
      return router.refresh();
    }
    setSaid({ text: errText(a), bad: true });
    if (a.data.error === 'ALIKE') setForce(true);
    if (a.status === 409 && a.data.error === 'STALE') router.refresh();
  }

  const clusterAct = (x: PlanCluster, action: string, postId?: string | null) => send('POST', `/api/admin/blog/clusters/${x.id}`, { action, version: x.version, ...(postId !== undefined ? { postId } : {}) });
  const topicAct = (x: PlanTopic, action: string) =>
    send('POST', `/api/admin/blog/topics/${x.id}`, { action, version: x.version }, (d) => {
      if (action === 'start' && typeof d.postId === 'string') {
        setSaid({ text: l('started'), bad: false });
        router.push(`${EDITOR}/${d.postId}`);
      }
    });

  // ---- the alike line under the new topic, as you type ----
  const pool = useMemo(
    () => [
      ...plan.clusters.flatMap((x) => x.posts).concat(plan.loose).map((x) => ({ kind: 'post' as const, id: x.id, title: x.title, query: null })),
      ...plan.clusters.flatMap((x) => x.topics).concat(plan.topics).filter((x) => !x.archived && !x.postId && x.status !== 'rejected').map((x) => ({ kind: 'topic' as const, id: x.id, title: x.title, query: x.query })),
    ],
    [plan],
  );
  const alike = tp.title.trim().length >= 3 ? closest(tp.title, tp.query, pool) : null;
  const level = alikeLevel(alike, plan.card.value);

  const gapText = (g: LinkGap) => l(`gap.${g.kind}`, { title: g.title ?? '', path: g.path });
  const sel = (key: string, label: string, value: string, on: (v: string) => void, opts: [string, string][]) => (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={`${id}-${key}`}>
        {label}
      </label>
      <select id={`${id}-${key}`} className="a2-sel" value={value} disabled={busy || !p.canWrite} onChange={(e) => on(e.target.value)} data-testid={`pl-${key}`}>
        {opts.map(([v, w]) => (
          <option key={v} value={v}>
            {w}
          </option>
        ))}
      </select>
    </div>
  );
  const inp = (key: string, label: string, value: string, on: (v: string) => void, max: number, lang?: string) => (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={`${id}-${key}`}>
        {label}
      </label>
      <input id={`${id}-${key}`} className="a2-inp" value={value} maxLength={max} lang={lang} disabled={busy || !p.canWrite} onChange={(e) => on(e.target.value)} data-testid={`pl-${key}`} />
    </div>
  );
  const catName = (x: { nameEn: string; nameBn: string | null }) => (p.lang === 'bn' && x.nameBn) || x.nameEn;
  const clusterName = (x: PlanCluster) => (p.lang === 'bn' && x.nameBn) || x.name;
  const clusterOpts: [string, string][] = [['', l('clusterNone')], ...live.map((x): [string, string] => [x.id, clusterName(x)])];

  // ---- a cluster's form ----
  const openCluster = (x: PlanCluster | null) => {
    setCl(x ? { name: x.name, nameBn: x.nameBn ?? '', categoryId: x.categoryId ?? '', targetPath: x.targetPath ?? '', keywords: x.keywords.join(', '), sortOrder: String(x.sortOrder) } : { name: '', nameBn: '', categoryId: '', targetPath: '', keywords: '', sortOrder: '0' });
    setEdit(x ? x.id : 'new');
    setSaid(null);
  };
  const saveCluster = (x: PlanCluster | null) => {
    const b = { name: cl.name, nameBn: cl.nameBn, categoryId: cl.categoryId || null, targetPath: cl.targetPath || null, keywords: (cl.keywords ?? '').split(',').map((k) => k.trim()).filter(Boolean), sortOrder: Number(cl.sortOrder) || 0 };
    return send(x ? 'PUT' : 'POST', x ? `/api/admin/blog/clusters/${x.id}` : '/api/admin/blog/clusters', x ? { ...b, version: x.version } : b, () => setEdit(null));
  };
  const targets: [string, string][] = [['', l('targetNone')], ...plan.choices.targets.map((x): [string, string] => [x.path, `${x.label} · ${x.path}`])];
  if (cl.targetPath && !targets.some(([v]) => v === cl.targetPath)) targets.push([cl.targetPath, cl.targetPath]);
  const clusterForm = (x: PlanCluster | null) => (
    <div className="jr-form" data-testid="pl-cluster-form">
      <div className="jr-g2">
        {inp('name', l('name'), cl.name ?? '', (v) => setCl({ ...cl, name: v }), 80)}
        {inp('nameBn', l('nameBn'), cl.nameBn ?? '', (v) => setCl({ ...cl, nameBn: v }), 80, 'bn')}
      </div>
      {sel('categoryId', l('category'), cl.categoryId ?? '', (v) => setCl({ ...cl, categoryId: v }), [['', l('categoryNone')], ...plan.choices.categories.map((x): [string, string] => [x.id, catName(x)])])}
      {sel('targetPath', l('target'), cl.targetPath ?? '', (v) => setCl({ ...cl, targetPath: v }), targets)}
      <div className="jr-g2">
        {inp('keywords', l('keywords'), cl.keywords ?? '', (v) => setCl({ ...cl, keywords: v }), 400)}
        {inp('sortOrder', l('sortOrder'), cl.sortOrder ?? '0', (v) => setCl({ ...cl, sortOrder: v.replace(/\D/g, '') }), 4)}
      </div>
      <div className="jr-row">
        <button type="button" className="a2-btn pri" disabled={busy} onClick={() => saveCluster(x)} data-testid="pl-cluster-save">
          {l('saveCluster')}
        </button>
        {x ? (
          <button type="button" className="a2-btn" disabled={busy} onClick={() => setEdit(null)}>
            {l('cancel')}
          </button>
        ) : null}
      </div>
    </div>
  );

  // ---- rows ----
  const postRow = (x: PlanCluster | null, post: PlanPost) => {
    const isPillar = x?.pillarPostId === post.id;
    return (
      <li key={post.id} data-testid="pl-post">
        <div className="jr-row">
          <div className="pl-main">
            <Link className="jr-name" href={`${EDITOR}/${post.id}`} lang={post.locale}>
              {post.title}
            </Link>
            <div className="a2-xs a2-mute">
              {isPillar ? <span className="a2-pill ok">{l('pillar')}</span> : null} <span className="a2-pill">{l(post.locale)}</span> <span className={`a2-pill${post.live ? ' ok' : ''}`}>{c(`views.${post.column}`)}</span>
            </div>
          </div>
          {x && p.canWrite && !x.archived ? (
            <div className="jr-steps">
              <button type="button" className="a2-btn" disabled={busy} onClick={() => clusterAct(x, 'pillar', isPillar ? null : post.id)}>
                {isPillar ? l('unpillar') : l('makePillar')}
              </button>
              <button type="button" className="a2-btn" disabled={busy} onClick={() => clusterAct(x, 'remove', post.id)}>
                {l('remove')}
              </button>
            </div>
          ) : null}
        </div>
        {post.gaps.length ? (
          <ul className="pl-gaps" data-testid="pl-gaps">
            {post.gaps.map((g) => (
              <li key={`${g.kind}-${g.path}`}>{gapText(g)}</li>
            ))}
          </ul>
        ) : null}
      </li>
    );
  };

  const topicRow = (x: PlanTopic) => {
    const acts: [string, string, boolean][] = x.archived
      ? [['restore', l('restore'), p.canWrite]]
      : x.postId
        ? []
        : x.status === 'proposed'
          ? [
              ['approve', l('approve'), p.canPublish],
              ['reject', l('reject'), p.canPublish],
            ]
          : x.status === 'approved'
            ? [
                ['start', l('start'), p.canWrite],
                ['reject', l('reject'), p.canPublish],
              ]
            : [['reopen', l('reopen'), p.canWrite]];
    if (!x.archived && !x.postId) acts.push(['archive', l('archive'), p.canWrite]);
    return (
      <li key={x.id} className={x.archived ? 'pl-off' : undefined} data-testid="pl-topic">
        <div className="jr-row">
          <div className="pl-main">
            <b lang={x.locale}>{x.title}</b>
            {x.query ? <div className="a2-xs a2-mute pl-q">{x.query}</div> : null}
            <div className="a2-xs a2-mute">
              <span className={`a2-pill${x.status === 'approved' ? ' ok' : x.status === 'proposed' ? ' warn' : ''}`}>{x.postColumn ? c(`views.${x.postColumn}`) : l(`st.${x.status}`)}</span> <span className="a2-pill">{l(`p${x.priority}`)}</span> <span className="a2-pill">{l(x.locale)}</span>
              {x.isPillar ? <span className="a2-pill"> {l('pillarTopic')}</span> : null}
              {x.briefId ? <span className="a2-pill ok"> {l('briefOk')}</span> : null}
              {x.archived ? ` · ${l('archived')}` : ''}
            </div>
            {x.alike ? <div className={`a2-xs ${x.alike.level === 'warn' ? 'a2-bad' : 'a2-mute'}`}>{l(x.alike.level === 'warn' ? 'alikeWarn' : 'alikeNear', { n: x.alike.score, title: x.alike.title })}</div> : null}
          </div>
          <div className="jr-steps">
            {x.briefId ? (
              <Link className="a2-btn" href={`${BRIEF}/${x.briefId}`} data-testid="pl-t-brief">
                {l('brief')}
              </Link>
            ) : !x.archived && x.status !== 'rejected' && p.canWrite ? (
              <Link className="a2-btn" href={`${BRIEF}/new?topic=${x.id}`} data-testid="pl-t-brief">
                {l('briefNew')}
              </Link>
            ) : null}
            {x.postId ? (
              <Link className="a2-btn" href={`${EDITOR}/${x.postId}`}>
                {l('open')}
              </Link>
            ) : null}
            {acts
              .filter((a) => a[2])
              .map(([a, w]) => (
                <button key={a} type="button" className={`a2-btn${a === 'approve' || a === 'start' ? ' pri' : ''}`} disabled={busy} onClick={() => topicAct(x, a)} data-testid={`pl-t-${a}`}>
                  {w}
                </button>
              ))}
          </div>
        </div>
      </li>
    );
  };

  const saidLine = said ? (
    <p className={`a2-sm jr-said${said.bad ? ' a2-bad' : ''}`} role="status">
      {said.text}
    </p>
  ) : null;

  if (p.part === 'queue') {
    // PR 244: the topics waiting for the owner's yes, month by month, and what was decided by itself lately.
    const monthName = (m: string) => {
      const [y, mo] = m.split('-').map(Number);
      return y && mo ? new Intl.DateTimeFormat(p.lang === 'bn' ? 'bn-BD' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, 1))) : l('noMonth');
    };
    const when = (iso: string) => new Intl.DateTimeFormat(p.lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    return (
      <>
        <section className="a2-card a2-sc" aria-labelledby={`${id}-q`} data-testid="pl-queue">
          <h2 className="a2-h3" id={`${id}-q`}>
            {l('queue')}
          </h2>
          <p className="a2-cs">{plan.approval.value.mode === 'auto' ? l('queueAuto') : l('queueOwner')}</p>
          {plan.queue.length ? (
            plan.queue.map((q) => (
              <div key={q.month} className="pl-batch" data-testid="pl-batch">
                <div className="jr-row">
                  <b>{l('batchOf', { month: monthName(q.month), n: q.topics.length })}</b>
                  {p.canPublish && q.month ? (
                    <button
                      type="button"
                      className="a2-btn pri"
                      disabled={busy}
                      onClick={() =>
                        send('POST', '/api/admin/blog/topics/batch', { month: q.month }, (d) => setSaid({ text: l('batchDone', { n: Number(d.approved) || 0, held: Number(d.held) || 0 }), bad: false }))
                      }
                      data-testid="pl-batch-approve"
                    >
                      {l('approveAll')}
                    </button>
                  ) : null}
                </div>
                <ul className="jr-shelf">{q.topics.map(topicRow)}</ul>
              </div>
            ))
          ) : (
            <p className="a2-sm a2-mute">{l('queueEmpty')}</p>
          )}
          {saidLine}
        </section>
        {plan.approval.value.mode === 'auto' || plan.digest.items.length ? (
          <section className="a2-card a2-sc" aria-labelledby={`${id}-dg`} data-testid="pl-digest">
            <h2 className="a2-h3" id={`${id}-dg`}>
              {l('digest', { n: plan.digest.days })}
            </h2>
            {plan.digest.items.length ? (
              <ul className="jr-hist">
                {plan.digest.items.map((x) => (
                  <li key={`${x.kind}-${x.id}-${x.at}`}>
                    <span className="a2-pill">{l(x.kind === 'topic' ? 'dgTopic' : 'dgPost')}</span> {x.kind === 'post' ? <Link href={`${EDITOR}/${x.id}`}>{x.title}</Link> : x.title} <span className="a2-xs a2-mute">· {when(x.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute">{l('digestEmpty')}</p>
            )}
          </section>
        ) : null}
      </>
    );
  }

  if (p.part === 'forms') {
    const addTopic = () =>
      send('POST', '/api/admin/blog/topics', { title: tp.title, query: tp.query, locale: tp.locale, clusterId: tp.clusterId || null, priority: Number(tp.priority), isPillar: tp.isPillar, authorId: tp.authorId || null, force }, () => {
        setTp({ ...tp, title: '', query: '', isPillar: false });
        setForce(false);
      });
    return (
      <>
        <section className="a2-card a2-sc" aria-labelledby={`${id}-nt`}>
          <h2 className="a2-h3" id={`${id}-nt`}>
            {l('newTopic')}
          </h2>
          <p className="a2-cs">{l('newTopicSub')}</p>
          {p.canWrite ? (
            <div className="jr-form" data-testid="pl-topic-form">
              {inp('title', l('topic'), tp.title, (v) => (setTp({ ...tp, title: v }), setForce(false)), 160)}
              {inp('query', l('query'), tp.query, (v) => (setTp({ ...tp, query: v }), setForce(false)), 160)}
              <div className="jr-g2">
                {sel('locale', l('locale'), tp.locale, (v) => setTp({ ...tp, locale: v }), [
                  ['en', l('en')],
                  ['bn', l('bn')],
                ])}
                {sel('priority', l('priority'), tp.priority, (v) => setTp({ ...tp, priority: v }), [
                  ['1', l('p1')],
                  ['2', l('p2')],
                  ['3', l('p3')],
                ])}
              </div>
              {sel('clusterId', l('cluster'), tp.clusterId, (v) => setTp({ ...tp, clusterId: v }), clusterOpts)}
              {sel('authorId', l('author'), tp.authorId, (v) => setTp({ ...tp, authorId: v }), [['', l('authorNone')], ...plan.choices.authors.map((x): [string, string] => [x.id, x.displayName])])}
              <div className="a2-swl">
                <span id={`${id}-pil`}>{l('isPillar')}</span>
                <button type="button" className={`a2-sw${tp.isPillar ? ' on' : ''}`} role="switch" aria-checked={tp.isPillar} aria-labelledby={`${id}-pil`} disabled={busy} onClick={() => setTp({ ...tp, isPillar: !tp.isPillar })} data-testid="pl-isPillar" />
              </div>
              {tp.title.trim().length >= 3 ? (
                <p className={`a2-xs${level === 'warn' ? ' a2-bad' : ' a2-mute'}`} data-testid="pl-alike">
                  {level === 'none' ? l('alikeNone') : l(level === 'warn' ? 'alikeWarn' : 'alikeNear', { n: alike!.score, title: alike!.title })}
                </p>
              ) : null}
              <div className="jr-row">
                <button type="button" className="a2-btn pri" disabled={busy || tp.title.trim().length < 3} onClick={addTopic} data-testid="pl-topic-add">
                  {force ? l('addAnyway') : l('addTopic')}
                </button>
              </div>
            </div>
          ) : null}
          {saidLine}
        </section>
        <section className="a2-card a2-sc" aria-labelledby={`${id}-nc`}>
          <h2 className="a2-h3" id={`${id}-nc`}>
            {l('newCluster')}
          </h2>
          <p className="a2-cs">{l('newClusterSub')}</p>
          {p.canWrite ? (
            edit === 'new' ? (
              clusterForm(null)
            ) : (
              <button type="button" className="a2-btn a2-mt12" disabled={busy} onClick={() => openCluster(null)} data-testid="pl-cluster-new">
                {l('newCluster')}
              </button>
            )
          ) : null}
        </section>
      </>
    );
  }

  return (
    <>
      {saidLine}
      {plan.clusters.length ? (
        plan.clusters.map((x) => {
          const open = x.topics.filter((y) => !y.archived);
          const target = x.targetPath;
          return (
            <section key={x.id} className={`a2-card a2-sc${x.archived ? ' pl-off' : ''}`} aria-labelledby={`${id}-c-${x.id}`} data-testid="pl-cluster">
              <div className="jr-row">
                <div className="pl-main">
                  <h3 className="a2-h3" id={`${id}-c-${x.id}`}>
                    {clusterName(x)}
                  </h3>
                  <div className="a2-xs a2-mute">
                    {l('posts', { n: x.posts.length })} · {l('topicsN', { n: open.length })} · {x.gaps ? <span className="a2-bad">{l('gapsN', { n: x.gaps })}</span> : l('allLinked')}
                    {x.archived ? ` · ${l('archived')}` : ''}
                  </div>
                  <div className="a2-xs a2-mute pl-q">
                    {l('target')}: {target ?? l('targetNone')}
                    {x.keywords.length ? ` · ${x.keywords.join(', ')}` : ''}
                  </div>
                </div>
                {p.canWrite ? (
                  <div className="jr-steps">
                    {!x.archived ? (
                      <button type="button" className="a2-btn" disabled={busy} onClick={() => openCluster(x)}>
                        {l('editCluster')}
                      </button>
                    ) : null}
                    <button type="button" className="a2-btn" disabled={busy} onClick={() => clusterAct(x, x.archived ? 'restore' : 'archive')}>
                      {x.archived ? l('restore') : l('archive')}
                    </button>
                  </div>
                ) : null}
              </div>
              {edit === x.id ? clusterForm(x) : null}
              {x.posts.length ? <ul className="jr-shelf">{x.posts.map((y) => postRow(x, y))}</ul> : null}
              {x.topics.length ? <ul className="jr-shelf">{x.topics.map(topicRow)}</ul> : null}
              {p.canWrite && !x.archived && plan.loose.length ? (
                <div className="jr-row pl-add">
                  {sel(`add-${x.id}`, l('addPost'), pick[x.id] ?? '', (v) => setPick({ ...pick, [x.id]: v }), [['', l('pick')], ...plan.loose.map((y): [string, string] => [y.id, y.title])])}
                  <button type="button" className="a2-btn" disabled={busy || !pick[x.id]} onClick={() => clusterAct(x, 'add', pick[x.id])} data-testid="pl-add-post">
                    {l('addPostBtn')}
                  </button>
                </div>
              ) : null}
            </section>
          );
        })
      ) : (
        <section className="a2-card a2-sc">
          <p className="a2-sm a2-mute">{l('noClusters')}</p>
        </section>
      )}
      <section className="a2-card a2-sc" aria-labelledby={`${id}-loose`} data-testid="pl-loose">
        <h2 className="a2-h3" id={`${id}-loose`}>
          {l('loose')}
        </h2>
        <p className="a2-cs">{plan.loose.length ? l('looseSub') : l('looseNone')}</p>
        {plan.loose.length ? <ul className="jr-shelf">{plan.loose.map((y) => postRow(null, y))}</ul> : null}
        {plan.topics.length ? (
          <>
            <h3 className="a2-h3 a2-mt12">{l('looseTopics')}</h3>
            <ul className="jr-shelf">{plan.topics.map(topicRow)}</ul>
          </>
        ) : null}
      </section>
    </>
  );
}
