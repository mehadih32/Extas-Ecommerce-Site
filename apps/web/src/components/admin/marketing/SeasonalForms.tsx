'use client';
// S13 · PR 280 — Marketing › Seasonal home's small forms: save the home page as it is as a look, change a look for the
// season (name, sections on/off and their order, the hero's three lines in both languages, the hero's collection),
// schedule a look for a window, and one-button actions (stop a window, set a look aside or bring it back). POST
// {action, …} to /api/admin/marketing/seasonal (`marketing.campaigns.write`); the API checks everything again.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

const API = '/api/admin/marketing/seasonal';

/** The page's words for these forms (already in the viewer's language). */
export interface SeasonalFormTexts {
  err: Record<string, string>;
  fields: Record<string, string>;
}

type Msg = { ok: boolean; text: string } | null;
type Words = { en: string; bn: string };

async function post(texts: SeasonalFormTexts, body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; text: string }> {
  try {
    const res = await fetch(API, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; details?: string[] };
    if (data.ok) return { ok: true };
    const code = data.error ?? (res.status === 403 ? 'forbidden' : res.status === 401 ? 'unauthorized' : 'other');
    const fields = (data.details ?? []).map((f) => texts.fields[f] ?? f).join(', ');
    return { ok: false, text: (texts.err[code] ?? texts.err.other ?? code).replace('{fields}', fields) };
  } catch {
    return { ok: false, text: texts.err.network ?? 'network' };
  }
}

function Note({ msg, testId }: { msg: Msg; testId: string }) {
  if (!msg) return null;
  return (
    <p className="a2-xs" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }} data-testid={testId}>
      {msg.text}
    </p>
  );
}

function useSend(texts: SeasonalFormTexts) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const send = async (body: Record<string, unknown>, done?: string): Promise<boolean> => {
    setBusy(true);
    setMsg(null);
    const r = await post(texts, body);
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.text });
      return false;
    }
    if (done) setMsg({ ok: true, text: done });
    router.refresh();
    return true;
  };
  return { busy, msg, send };
}

/** One button that sends one action (stop a window, set a look aside, bring it back) and reloads the page. */
export function SeasonalAct({ texts, body, label, testId }: { texts: SeasonalFormTexts; body: Record<string, unknown>; label: string; testId: string }) {
  const { busy, msg, send } = useSend(texts);
  return (
    <span>
      <button type="button" className="a2-btn" disabled={busy} data-testid={testId} onClick={() => void send(body)}>
        {label}
      </button>
      <Note msg={msg} testId={`${testId}-msg`} />
    </span>
  );
}

/** "Save the home page as it is now" under a name. */
export function SeasonalSaveForm({ texts, w }: { texts: SeasonalFormTexts; w: { name: string; namePh: string; help: string; save: string; saved: string } }) {
  const uid = useId();
  const [name, setName] = useState('');
  const { busy, msg, send } = useSend(texts);
  return (
    <div className="mail-form" data-testid="sh-save-form">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-n`}>
          {w.name}
        </label>
        <input id={`${uid}-n`} className="a2-inp" value={name} maxLength={80} placeholder={w.namePh} onChange={(e) => setName(e.target.value)} data-testid="sh-save-name" />
        <p className="a2-xs a2-mute">{w.help}</p>
      </div>
      <span>
        <button type="button" className="a2-btn pri" disabled={busy} data-testid="sh-save" onClick={async () => (await send({ action: 'look.save', name }, w.saved)) && setName('')}>
          {w.save}
        </button>
        <Note msg={msg} testId="sh-save-msg" />
      </span>
    </div>
  );
}

export interface LookEditWords {
  name: string;
  sections: string;
  sectionsHelp: string;
  up: string;
  down: string;
  lines: Record<'eyebrow' | 'title' | 'sub', string>;
  en: string;
  bn: string;
  lineHelp: string;
  collection: string;
  collNone: string;
  collHelp: string;
  save: string;
  saved: string;
}

export interface LookEditValue {
  name: string;
  sections: { id: string; on: boolean }[];
  hero: Record<'eyebrow' | 'title' | 'sub', Words | null>;
  collection: string | null;
}

/** Changes one look for the season. Nothing on the live home page changes until a window shows it. */
export function SeasonalLookEditor({ texts, id, value, sectionNames, collections, w }: { texts: SeasonalFormTexts; id: string; value: LookEditValue; sectionNames: Record<string, string>; collections: { value: string; label: string }[]; w: LookEditWords }) {
  const uid = useId();
  const [name, setName] = useState(value.name);
  const [sections, setSections] = useState(value.sections);
  const [hero, setHero] = useState<Record<'eyebrow' | 'title' | 'sub', Words>>({
    eyebrow: value.hero.eyebrow ?? { en: '', bn: '' },
    title: value.hero.title ?? { en: '', bn: '' },
    sub: value.hero.sub ?? { en: '', bn: '' },
  });
  const [collection, setCollection] = useState(value.collection ?? '');
  const { busy, msg, send } = useSend(texts);
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setSections(next);
  };
  return (
    <div className="mail-form" data-testid="sh-edit-form">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-n`}>
          {w.name}
        </label>
        <input id={`${uid}-n`} className="a2-inp" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-testid="sh-edit-name" />
      </div>
      <fieldset className="a2-fld sh-fs">
        <legend className="a2-lbl">{w.sections}</legend>
        <p className="a2-xs a2-mute">{w.sectionsHelp}</p>
        <ol className="sh-secs">
          {sections.map((s, i) => (
            <li key={s.id} className="sh-sec" data-testid="sh-sec" data-id={s.id}>
              <label className="a2-chkl sh-grow">
                <input type="checkbox" className="a2-chk" checked={s.on} onChange={(e) => setSections(sections.map((x) => (x.id === s.id ? { ...x, on: e.target.checked } : x)))} data-testid={`sh-sec-on-${s.id}`} />
                <span>{sectionNames[s.id] ?? s.id}</span>
              </label>
              <button type="button" className="a2-btn" disabled={i === 0} aria-label={`${w.up}: ${sectionNames[s.id] ?? s.id}`} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" className="a2-btn" disabled={i === sections.length - 1} aria-label={`${w.down}: ${sectionNames[s.id] ?? s.id}`} onClick={() => move(i, 1)}>
                ↓
              </button>
            </li>
          ))}
        </ol>
      </fieldset>
      {(['eyebrow', 'title', 'sub'] as const).map((l) => (
        <fieldset key={l} className="a2-fld sh-fs">
          <legend className="a2-lbl">{w.lines[l]}</legend>
          <div className="sh-pair">
            {(['en', 'bn'] as const).map((lang) => (
              <div key={lang} className="a2-fld">
                <label className="a2-xs a2-mute" htmlFor={`${uid}-${l}-${lang}`}>
                  {lang === 'en' ? w.en : w.bn}
                </label>
                <input id={`${uid}-${l}-${lang}`} className="a2-inp" value={hero[l][lang]} maxLength={160} lang={lang} onChange={(e) => setHero({ ...hero, [l]: { ...hero[l], [lang]: e.target.value } })} data-testid={`sh-line-${l}-${lang}`} />
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="a2-xs a2-mute">{w.lineHelp}</p>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-c`}>
          {w.collection}
        </label>
        <select id={`${uid}-c`} className="a2-sel" value={collection} onChange={(e) => setCollection(e.target.value)} data-testid="sh-edit-collection">
          <option value="">{w.collNone}</option>
          {collections.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="a2-xs a2-mute">{w.collHelp}</p>
      </div>
      <span>
        <button type="button" className="a2-btn pri" disabled={busy} data-testid="sh-edit-save" onClick={() => void send({ action: 'look.update', id, name, sections, hero, collection: collection || null }, w.saved)}>
          {w.save}
        </button>
        <Note msg={msg} testId="sh-edit-msg" />
      </span>
    </div>
  );
}

/** Schedules a look for a window on the shop's clock (an empty end = until it is stopped). */
export function SeasonalWindowForm({ texts, looks, w }: { texts: SeasonalFormTexts; looks: { value: string; label: string }[]; w: { look: string; starts: string; ends: string; endsHelp: string; clock: string; add: string; added: string } }) {
  const uid = useId();
  const [lookId, setLookId] = useState(looks[0]?.value ?? '');
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  const { busy, msg, send } = useSend(texts);
  return (
    <div className="mail-form" data-testid="sh-win-form">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-l`}>
          {w.look}
        </label>
        <select id={`${uid}-l`} className="a2-sel" value={lookId} onChange={(e) => setLookId(e.target.value)} data-testid="sh-win-look">
          {looks.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <div className="sh-pair">
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${uid}-s`}>
            {w.starts}
          </label>
          <input id={`${uid}-s`} type="datetime-local" className="a2-inp" value={starts} onChange={(e) => setStarts(e.target.value)} data-testid="sh-win-starts" />
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${uid}-e`}>
            {w.ends}
          </label>
          <input id={`${uid}-e`} type="datetime-local" className="a2-inp" value={ends} onChange={(e) => setEnds(e.target.value)} data-testid="sh-win-ends" />
        </div>
      </div>
      <p className="a2-xs a2-mute">
        {w.endsHelp} {w.clock}
      </p>
      <span>
        <button
          type="button"
          className="a2-btn pri"
          disabled={busy || !lookId}
          data-testid="sh-win-add"
          onClick={async () => {
            if (await send({ action: 'window.add', lookId, starts, ends }, w.added)) {
              setStarts('');
              setEnds('');
            }
          }}
        >
          {w.add}
        </button>
        <Note msg={msg} testId="sh-win-msg" />
      </span>
    </div>
  );
}
