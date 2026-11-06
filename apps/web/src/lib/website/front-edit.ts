// S02 · PR 79 (register "Front-end editing: open the page, change a label, publish"; BACKEND-ARCHITECTURE WEB-05) — the
// server side of editing the shop's words on the shop page: the switch (`language.frontEdit`, off as shipped) as the
// Words page's settings card, and the words a shop page shows, for the panel on that page (lib/website/words-match.ts).
// Publishing goes through Website › Words & language's own save (PUT /api/admin/website/dictionary, the same checks,
// STALE and audit). /api/admin/website/front-edit:
//   GET   the card (`website.read`)
//   PUT   {key: 'frontEdit', value, version} the switch (`website.words.write`; audited website.frontEdit.save)
//   POST  {lang, texts} the page's words with the saved words' version (`website.read`; refused while the switch is off)
// Nothing here touches a price, an order or a customer.
import { createHash } from 'node:crypto';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { frontEditSchema, storeTarget, type FrontEdit } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { matchWords, PAGE_TEXTS_MAX, type PageWord } from './words-match';
import { labelsOf, versionOf, WordsError, type WordsDeps } from './words-admin';

const S = MOTHER_STORE_ID;
const CARD = 'frontEdit';

interface Who {
  actor: Actor;
  ctx: RequestContext;
}

export interface FrontEditCard {
  key: string;
  value: FrontEdit;
  version: string;
}

const cardVersion = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);

async function switchOf(deps: WordsDeps): Promise<FrontEdit> {
  return (await deps.resolver.value('language.frontEdit', { storeId: S })) as FrontEdit;
}

/** The switch as the Words page's settings card. */
export async function frontEditCard(deps: WordsDeps): Promise<FrontEditCard> {
  const value = await switchOf(deps);
  return { key: CARD, value, version: cardVersion(value) };
}

/** Saves the switch (`website.words.write`, checked by the handler): STALE on a save in between, audited when changed. */
export async function saveFrontEdit(deps: WordsDeps, who: Who, input: unknown): Promise<FrontEditCard> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== CARD) throw new WordsError('INVALID_INPUT', 400, ['key']);
  const ok = frontEditSchema.safeParse(o.value);
  if (!ok.success) throw new WordsError('INVALID_INPUT', 400, ['value']);
  const before = await switchOf(deps);
  if (o.version !== cardVersion(before)) throw new WordsError('STALE', 409);
  if (cardVersion(ok.data) !== cardVersion(before)) {
    await deps.resolver.set('language.frontEdit', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Words & language' });
    await audit(deps.db, who.actor, { storeId: S, action: 'website.frontEdit.save', entityType: 'Setting', entityId: 'language.frontEdit', before, after: ok.data }, who.ctx);
  }
  return frontEditCard(deps);
}

/** The words one shop page shows (the panel sends what it sees), with the saved words' version to publish with. */
export async function pageWords(deps: WordsDeps, input: unknown): Promise<{ version: string; words: PageWord[] }> {
  if (!(await switchOf(deps)).enabled) throw new WordsError('FRONT_EDIT_OFF', 409);
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.lang !== 'en' && o.lang !== 'bn') throw new WordsError('INVALID_INPUT', 400, ['lang']);
  if (!Array.isArray(o.texts) || o.texts.length > PAGE_TEXTS_MAX || o.texts.some((x) => typeof x !== 'string')) throw new WordsError('INVALID_INPUT', 400, ['texts']);
  const labels = await labelsOf(deps);
  return { version: versionOf(labels), words: matchWords(labels, o.lang, o.texts as string[]) };
}

const answer = (e: unknown): Response => (e instanceof WordsError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/** /api/admin/website/front-edit (see the head of this file). */
export async function frontEditHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT' && method !== 'POST') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request);
  const g = await guardAdmin(request, deps, { permission: method === 'PUT' ? 'website.words.write' : 'website.read', storeId: S });
  if (g instanceof Response) return g;
  const d: WordsDeps = { db: deps!.db, resolver: deps!.resolver };
  try {
    if (method === 'GET') return json({ ok: true, cards: { [CARD]: await frontEditCard(d) } });
    if (method === 'PUT') return json({ ok: true, cards: { [CARD]: await saveFrontEdit(d, { actor: g.actor, ctx: g.ctx }, b) } });
    return json({ ok: true, canEdit: g.permissions?.has('website.words.write') ?? false, ...(await pageWords(d, b)) });
  } catch (e) {
    return answer(e);
  }
}
