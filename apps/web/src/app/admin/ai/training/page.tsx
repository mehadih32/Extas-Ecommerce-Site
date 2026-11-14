// S28 · PR 713 (CN-048, admin prototype v5, AI Center › Training) at /admin/ai/training — what the owner has taught the agents, in the
// owner's own words: instructions for every agent or for one, topics no agent may bring up, and the version history with "Restore
// this version" (a restore saves the old set again as a NEW version; nothing is deleted). Seeing needs `ai.read`; teaching and
// restoring `ai.control`. The text is kept as rows of AiTrainingExample (S15 · PR 323), nothing is overwritten or deleted. AI stays off until `ai.enabled`: the page says so, and nothing here ever reaches a buyer. Not built from the
// prototype's Training tab (no sandbox, example corrections, documents or "describe a problem" box yet): the agents' own memory,
// skills sandbox and Gyani's investigations hold those. Words: messages/admin-training.*.json (`aiTraining.*`).
// lib/admin-ai/training-instructions.ts. Guide: docs/admin-guide/pages/ai/training.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { TRAINING_ALL, TRAINING_FORBIDDEN_TEXT_MAX, TRAINING_TEXT_MAX } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ForbiddenAddForm, ForbiddenRemoveButton, RestoreButton, TrainingAddForm, TrainingRemoveButton } from '@/components/admin/ai/TrainingControls';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { AI_AGENTS, aiAgentDef, isAiAgentKey } from '@/lib/admin-ai/agents';
import { instructionsScreen } from '@/lib/admin-ai/training-instructions-api';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-training.bn.json';
import en from '../../../../../messages/admin-training.en.json';
import '../ai.css';
import '../../settings-cards.css';
import './training.css';

export const dynamic = 'force-dynamic';

const KEY = 'aiTraining';
const HERE = '/admin/ai/training';
const API = '/api/admin/ai/training/instructions';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, aiTraining: (view.lang === 'bn' ? bn : en).aiTraining as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'aiTraining.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AiTrainingPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('ai.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="training-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="ai.read" />
      </div>
    );
  const c = (k: string, vars?: Record<string, string | number>) => t(view.dict, `aiTraining.${k}`, vars);
  const canControl = access.guard.permissions?.has('ai.control') ?? false;
  const [screen, aiOn] = await Promise.all([instructionsScreen(access.deps), access.deps.resolver.value('ai.enabled')]);
  const { state, versions, card } = screen;
  const at = (x: Date) => dateTime(x.toISOString(), view.locale, view.timeZone);
  const agentName = (key: string) => {
    if (key === TRAINING_ALL) return c('scope.all');
    if (!isAiAgentKey(key)) return key;
    const a = aiAgentDef(key);
    return `${a.emoji} ${view.lang === 'bn' ? a.nameBn : a.nameEn}`;
  };
  const scopes = [{ key: TRAINING_ALL, label: c('scope.all') }, ...AI_AGENTS.map((a) => ({ key: a.key as string, label: agentName(a.key) }))];
  const opName = (scope: string) => (scope === 'forbidden' ? '' : agentName(scope));
  const opLine = (o: { op: 'add' | 'remove'; scope: string; text: string }) =>
    o.scope === 'forbidden' ? c(o.op === 'add' ? 'ver.addForbidden' : 'ver.removeForbidden', { text: o.text }) : c(`ver.${o.op}`, { scope: opName(o.scope), text: o.text });

  const hasMore = versions.total > versions.rows.length;
  const opt = (k: string) => c(`opt.${k}`);
  const texts: FieldsCardTexts = {
    h: opt('h'),
    d: opt('d'),
    save: opt('save'),
    saving: opt('saving'),
    saved: opt('saved'),
    discard: opt('discard'),
    unsaved: opt('unsaved'),
    readOnly: opt('readOnly'),
    pairHelp: '',
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'FORBIDDEN', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, opt(`err.${k}`)])),
  };
  const fields: FieldsCardField[] = [{ kind: 'number', path: 'versionRows', label: opt('versionRows'), help: opt('versionRowsHelp'), min: 5, max: 100 }];
  const removeTexts = { remove: c('instr.remove'), label: c('instr.removeLabel'), done: c('instr.removed'), failed: c('instr.failed') };

  return (
    <div className="a2-z ai-page" data-testid="training-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      {!aiOn ? (
        <div className="a2-note a2-mt12" role="note" data-testid="training-ai-off">
          <span>{c('aiOff')}</span>
        </div>
      ) : null}
      {!canControl ? (
        <div className="a2-note a2-mt12" role="note" data-testid="training-readonly">
          <span>{c('needPermission')}</span>
        </div>
      ) : null}
      <div className="a2-note a2-mt12" role="note">
        <span>{c('rules')}</span>
      </div>

      <div className="tr-grid">
        <section className="a2-card tr-card" data-testid="training-instructions" aria-labelledby="tr-instr-h">
          <h2 className="a2-h3" id="tr-instr-h">
            {c('instr.h')}
          </h2>
          <p className="a2-sm a2-mute">{c('instr.d')}</p>
          {state.agents.length ? (
            state.agents.map((a) => (
              <div className="tr-scope" key={a.key} data-testid="training-scope" data-agent={a.key}>
                <b>{agentName(a.key)}</b>
                {a.lines.map((line) => (
                  <div className="tr-row" key={line} data-testid="training-line">
                    <span>{line}</span>
                    {canControl ? <TrainingRemoveButton agent={a.key} text={line} base={state.version} texts={removeTexts} /> : null}
                  </div>
                ))}
              </div>
            ))
          ) : (
            <p className="a2-sm a2-mute a2-mt6" data-testid="training-none">
              {c('instr.none')}
            </p>
          )}
          {canControl ? (
            <TrainingAddForm
              scopes={scopes}
              base={state.version}
              texts={{ agent: c('instr.agent'), text: c('instr.text'), placeholder: c('instr.placeholder'), add: c('instr.add'), done: c('instr.added'), failed: c('instr.failed'), max: TRAINING_TEXT_MAX }}
            />
          ) : null}
        </section>

        <section className="a2-card tr-card" data-testid="training-forbidden" aria-labelledby="tr-forb-h">
          <h2 className="a2-h3" id="tr-forb-h">
            {c('forbidden.h')}
          </h2>
          <p className="a2-sm a2-mute">{c('forbidden.d')}</p>
          {state.forbidden.length ? (
            <div className="tr-chips">
              {state.forbidden.map((f) => (
                <span className="tr-chip" key={f} data-testid="training-topic">
                  {f}
                  {canControl ? <ForbiddenRemoveButton text={f} base={state.version} texts={{ label: c('forbidden.removeLabel'), done: c('forbidden.removed'), failed: c('forbidden.failed') }} /> : null}
                </span>
              ))}
            </div>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{c('forbidden.none')}</p>
          )}
          {canControl ? <ForbiddenAddForm base={state.version} texts={{ text: c('forbidden.text'), placeholder: c('forbidden.placeholder'), add: c('forbidden.add'), done: c('forbidden.added'), failed: c('forbidden.failed'), max: TRAINING_FORBIDDEN_TEXT_MAX }} /> : null}
        </section>
      </div>

      <section className="a2-card a2-mt12" data-testid="training-versions" aria-labelledby="tr-ver-h">
        <h2 className="a2-h3" id="tr-ver-h">
          {c('ver.h')}
        </h2>
        <p className="a2-sm a2-mute">{c('ver.d')}</p>
        {versions.rows.length ? (
          versions.rows.map((v) => (
            <div className="tr-ver" key={v.id} data-testid="training-version" data-no={v.no}>
              <div className="tr-ver-h">
                <span>
                  <b>{c('ver.v', { n: v.no })}</b> {v.current ? <span className="a2-pill ok">{c('ver.inUse')}</span> : null}
                  <span className="a2-xs a2-mute a2-blk">
                    {at(v.at)}
                    {v.by ? ` · ${c('ver.by', { name: v.by })}` : ''}
                  </span>
                </span>
                {canControl && !v.current ? <RestoreButton versionId={v.id} no={v.no} base={state.version} texts={{ restore: c('ver.restore'), label: c('ver.restoreLabel'), done: c('ver.restored'), failed: c('ver.failed') }} /> : null}
              </div>
              {v.restoredFrom ? <span className="a2-xs a2-mute">{c('ver.restoredFrom', { n: v.restoredFrom })}</span> : null}
              {v.ops.length ? (
                <ul className="a2-sm">
                  {v.ops.map((o, i) => (
                    <li key={i}>{opLine(o)}</li>
                  ))}
                </ul>
              ) : (
                <span className="a2-xs a2-mute">{c('ver.noChange')}</span>
              )}
            </div>
          ))
        ) : (
          <p className="a2-sm a2-mute a2-mt6">{c('ver.none')}</p>
        )}
        {hasMore ? <p className="a2-xs a2-mute a2-mt6">{c('ver.more', { shown: versions.rows.length, total: versions.total })}</p> : null}
      </section>

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: card.key, value: { ...card.value }, version: card.version }} fields={fields} texts={texts} canEdit={canControl} testId="training-options" />
      </div>
    </div>
  );
}
