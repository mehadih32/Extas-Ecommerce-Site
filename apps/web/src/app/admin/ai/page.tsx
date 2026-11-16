// S15 · PR 304 (C1.1, C1.2; AIC-01 Control room, Blueprint C1.2; demo 97y-adm2-ai.js) — AI › Control room at
// `/admin/ai` (Lumen, `data-lm-ready`): the AI 360 home screen. Four tiles (agents running now, today's cost, this
// month's cost, the monthly cap), and a card per fixed agent with its status, what it last did and its own pause
// button (`ai.control`). Nothing here is invented: with no AI provider wired yet (PR 306) and no job run, the cost
// is honestly 0 and "last activity" is honestly empty. Seeing the page needs `ai.read`.
//
// S15 · PR 305 (C1.3) — the master-switch banner now turns `ai.enabled` on or off itself (MasterSwitch, `ai.control`,
// AIC-01's own big switch), with a money-safety note while no monthly cap is set yet. Each agent card also carries
// "keep running even when AI is off" (KeepOnSwitch, `AiAgent.keepOnWhenMasterOff`) — a property of every agent, not
// a special case — and the status pill says so when that is why an agent is working while the master is off.
//
// S15 · PR 307 (C1.5) — each card also carries its own model pick (ModelPickSelect, `AiAgent.selectedProvider`):
// the practice writer plus the four PR 306 connections, an un-Tested one shown but disabled. A "Recommended" pill
// marks Claude's own pick (the first ready provider, Anthropic first); the note beside the select always explains
// the effect — matches the recommendation, or honestly says cost/quality comparisons wait for the AI Cost Book
// (PR 312) — never a number this page has not actually measured.
//
// S15 · PR 308 (C1.6) — each card also carries its own schedule (ScheduleEditor, `AiAgent.schedule`): always (the
// default — no time restriction) or a daily/weekly clock time, with a plain preview of when it would next fire.
// Nothing runs on it yet (no job runner reads a schedule); it is honestly a preview, same as a pause switch or a
// model pick before any AI key existed.
//
// S15 · PR 309 (C1.6) — each card also carries its own monthly spend cap (CapInput, `AiAgent.monthlyCapMinor`):
// this month's spend against the cap, with a status pill (none/ok/warned/paused). Crossing 80% or 100% sends the
// owner's Telegram warning (checkAgentCapAlerts, inside `controlRoomView` itself) — real and live, not a preview.
//
// S15 · PR 310 (A5.2, A5.6) — a new "Which data may reach which model" card states the Locked policy itself
// (personal and business data: paid connections only; public/draft work: a free-capable connection is allowed),
// and each agent card's model row now also names its own data class and, only when the policy actually moved the
// owner's pick (`routingDowngraded`), an honest note naming what runs instead and why — never a second number this
// page has not measured, same spirit as PR 307's model note.
//
// S15 · PR 324 (C1.4) — a new "AI-off test" card at the foot of the page (`o.offTest`, `./ai-off-guard.ts`): the
// real, already-computed result of a static source scan (`tools/ai-off-guard.mjs`), never the demo's own fabricated
// "7/7 passed". It has no "Run" button — a static scan has nothing to run live on this page, and it reads honestly
// as "not available yet" before any deploy has copied a result here.
//
// S15 · PR 506 (C1.4; `docs/agents/AGENT-PROTOCOL.md` names this beside the master switch (PR 305) and the spend cap
// (PR 309) as the third safety pillar; demo 89b-admin-agents.js's own "Proof: the shop works with AI off" card,
// which simulates "6 of 6 passed" the instant its own button is pressed) — this page never ships that simulation
// either. The same `o.offTest` result already carries the honest `journeyN`/`journeyOk` count and a `journey` flag
// per check (added to `tools/ai-off-guard.json`): the AI-off test card below now marks each journey-tagged row with
// a small "whole-shop journey" badge and a summary line naming the real count, and a short note ties the three
// pillars together, naming the master switch's own current state and whether a monthly cap is set — read straight
// off this same `o`, never a second source.
// Guide: docs/admin-guide/pages/ai/control.md.
import type { Metadata } from 'next';
import { AiControlRoom, aiControlMetadata } from '@/components/admin/ai/ControlRoom';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return aiControlMetadata();
}

export default async function AiControlRoomPage() {
  return <AiControlRoom />;
}
