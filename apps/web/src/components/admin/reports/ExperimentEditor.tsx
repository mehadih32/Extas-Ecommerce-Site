'use client';
// S02 · PR 83 — writing an A/B test (Reports › Experiments › New test, or a draft's own page): its name and why, what it
// counts (added to the bag, or ordered), the share of visitors who see B and an optional last day, and version B: parts
// of shop pages shown or hidden (only the eye-toggles that are not about prices, offers, payment or delivery) and shop
// words in English and/or Bengali (found by "Find a word"; the server refuses money words again). A new test is saved as
// a draft (nothing is shown until it is started); a draft is saved with the version it was read at (STALE = read again).
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type ReactNode } from 'react';

export interface EditorEye {
  id: string;
  label: string;
  area: string;
  areaLabel: string;
}

export interface EditorTest {
  id: string | null;
  version: string | null;
  name: string;
  note: string;
  goal: 'addToBag' | 'order';
  shareB: number;
  endsOn: string | null;
  eye: Record<string, boolean>;
  words: Record<string, { en?: string; bn?: string }>;
  /** The shop's own words of the keys already in B. */
  shop: Record<string, { en: string; bn: string }>;
}

type W = (k: string, vars?: Record<string, string | number>) => string;
type Texts = Record<string, string>;

export function ExperimentEditor(p: { api: string; listHref: string; test: EditorTest; eyes: EditorEye[]; texts: Texts; canEdit: boolean }) {
  const uid = useId();
  const router = useRouter();
  const w: W = (k, vars) => Object.entries(vars ?? {}).reduce((s, [a, b]) => s.replace(`{${a}}`, String(b)), p.texts[k] ?? k);
  const t = p.test;
  const [name, setName] = useState(t.name);
  const [note, setNote] = useState(t.note);
  const [goal, setGoal] = useState(t.goal);
  const [share, setShare] = useState(String(t.shareB));
  const [endsOn, setEndsOn] = useState(t.endsOn ?? '');
  const [eye, setEye] = useState<[string, boolean][]>(Object.entries(t.eye));
  const [pick, setPick] = useState('');
  const [words, setWords] = useState<[string, { en: string; bn: string }][]>(Object.entries(t.words).map(([k, v]) => [k, { en: v.en ?? '', bn: v.bn ?? '' }]));
  const [shop, setShop] = useState(t.shop);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ key: string; en: string; bn: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const ro = !p.canEdit;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** "Find a word": asks the server a quarter second after the typing stops. */
  function find(v: string) {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) return setFound(null);
    timer.current = setTimeout(() => {
      fetch(`${p.api}?words=${encodeURIComponent(v.trim())}`, { credentials: 'same-origin', cache: 'no-store' })
        .then((r) => r.json())
        .then((a: { words?: { key: string; en: string; bn: string }[] }) => setFound(a.words ?? []))
        .catch(() => setFound([]));
    }, 250);
  }

  const areas = [...new Map(p.eyes.map((e) => [e.area, e.areaLabel])).entries()];
  const label = (id: string) => p.eyes.find((e) => e.id === id)?.label ?? id;

  async function save() {
    if (!eye.length && !words.length) return setSaid({ text: w('nothing'), bad: true });
    setBusy(true);
    const b = {
      eye: Object.fromEntries(eye),
      words: Object.fromEntries(words.map(([k, v]) => [k, { ...(v.en.trim() ? { en: v.en.trim() } : {}), ...(v.bn.trim() ? { bn: v.bn.trim() } : {}) }])),
    };
    const payload = { name, note, goal, shareB: Number(share), endsOn: endsOn || null, b, ...(t.id ? { version: t.version } : {}) };
    let status = 0;
    let data: { id?: string; error?: string; details?: string[] } = {};
    try {
      const res = await fetch(t.id ? `${p.api}/${t.id}` : p.api, { method: t.id ? 'PUT' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      status = res.status;
      data = (await res.json().catch(() => ({ error: 'other' }))) as typeof data;
    } catch {
      data = { error: 'network' };
    }
    setBusy(false);
    if (status === 201 && data.id) {
      setSaid({ text: w('created'), bad: false });
      return router.push(`${p.listHref}/${data.id}`);
    }
    if (status === 200) {
      setSaid({ text: w('saved'), bad: false });
      return router.refresh();
    }
    const code = data.error ?? 'other';
    setSaid({ text: (p.texts[`err.${code}`] ?? p.texts['err.other'] ?? '').replace('{fields}', (data.details ?? []).join(', ')), bad: true });
    if (status === 409 && code === 'STALE') router.refresh();
  }

  const fld = (key: string, text: string, el: ReactNode, help?: string) => (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={`${uid}-${key}`}>
        {text}
      </label>
      {el}
      {help ? <span className="a2-xs a2-mute">{help}</span> : null}
    </div>
  );

  return (
    <div className="xpb-editor" data-testid="xp-editor">
      <section className="a2-sc a2-mt12">
        <div className="xpb-g2">
          {fld('name', w('f.name'), <input id={`${uid}-name`} className="a2-inp" value={name} maxLength={80} disabled={ro} onChange={(e) => setName(e.target.value)} data-testid="xp-name" />, w('f.nameHelp'))}
          {fld('note', w('f.note'), <input id={`${uid}-note`} className="a2-inp" value={note} maxLength={300} disabled={ro} onChange={(e) => setNote(e.target.value)} data-testid="xp-note" />, w('f.noteHelp'))}
          {fld(
            'goal',
            w('f.goal'),
            <select id={`${uid}-goal`} className="a2-sel" value={goal} disabled={ro} onChange={(e) => setGoal(e.target.value as EditorTest['goal'])} data-testid="xp-goal">
              <option value="addToBag">{w('goal.addToBag')}</option>
              <option value="order">{w('goal.order')}</option>
            </select>,
          )}
          {fld('share', w('f.share'), <input id={`${uid}-share`} className="a2-inp" type="number" min={1} max={99} step={1} value={share} disabled={ro} onChange={(e) => setShare(e.target.value)} data-testid="xp-share" />, w('f.shareHelp'))}
          {fld('ends', w('f.endsOn'), <input id={`${uid}-ends`} className="a2-inp" type="date" value={endsOn} disabled={ro} onChange={(e) => setEndsOn(e.target.value)} data-testid="xp-ends" />, w('f.endsOnHelp'))}
        </div>
      </section>

      <section className="a2-sc a2-mt12" data-testid="xp-eye">
        <h3 className="a2-h3">{w('eyeH')}</h3>
        <p className="a2-xs a2-mute xpb-mt6">{w('eyeHelp')}</p>
        <ul className="xpb-rows">
          {eye.map(([id, shown]) => (
            <li key={id} className="xpb-row" data-testid="xp-eye-row">
              <span className="a2-sm xpb-grow">{label(id)}</span>
              <select className="a2-sel" aria-label={label(id)} value={shown ? 'on' : 'off'} disabled={ro} onChange={(e) => setEye(eye.map(([x, v]) => [x, x === id ? e.target.value === 'on' : v]))}>
                <option value="on">{w('eyeShown')}</option>
                <option value="off">{w('eyeHidden')}</option>
              </select>
              {ro ? null : (
                <button type="button" className="a2-btn" onClick={() => setEye(eye.filter(([x]) => x !== id))}>
                  {w('remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
        {ro ? null : (
          <div className="xpb-add a2-mt12">
            <select className="a2-sel" aria-label={w('eyePick')} value={pick} onChange={(e) => setPick(e.target.value)} data-testid="xp-eye-pick">
              <option value="">{w('eyePick')}</option>
              {areas.map(([area, areaLabel]) => (
                <optgroup key={area} label={areaLabel}>
                  {p.eyes
                    .filter((e) => e.area === area && !eye.some(([x]) => x === e.id))
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              className="a2-btn"
              disabled={!pick}
              onClick={() => {
                setEye([...eye, [pick, true]]);
                setPick('');
              }}
              data-testid="xp-eye-add"
            >
              {w('eyeAdd')}
            </button>
          </div>
        )}
      </section>

      <section className="a2-sc a2-mt12" data-testid="xp-words">
        <h3 className="a2-h3">{w('wordsH')}</h3>
        <p className="a2-xs a2-mute xpb-mt6">{w('wordsHelp')}</p>
        <ul className="xpb-rows">
          {words.map(([key, v]) => (
            <li key={key} className="xpb-word" data-testid="xp-word-row">
              <span className="a2-xs a2-mute a2-mono xpb-key">{key}</span>
              <span className="a2-xs">
                {w('wordShop')}: {shop[key]?.en ?? ''} · {shop[key]?.bn ?? ''}
              </span>
              <div className="xpb-g2">
                <input className="a2-inp" aria-label={`${w('wordEn')} ${key}`} placeholder={w('wordEn')} lang="en" maxLength={300} value={v.en} disabled={ro} onChange={(e) => setWords(words.map(([k, x]) => [k, k === key ? { ...x, en: e.target.value } : x]))} />
                <input className="a2-inp" aria-label={`${w('wordBn')} ${key}`} placeholder={w('wordBn')} lang="bn" maxLength={300} value={v.bn} disabled={ro} onChange={(e) => setWords(words.map(([k, x]) => [k, k === key ? { ...x, bn: e.target.value } : x]))} />
              </div>
              {ro ? null : (
                <button type="button" className="a2-btn xpb-self" onClick={() => setWords(words.filter(([k]) => k !== key))}>
                  {w('remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
        {ro ? null : (
          <div className="a2-mt12">
            {fld('find', w('wordFind'), <input id={`${uid}-find`} className="a2-inp" type="search" value={q} placeholder={w('wordFindPh')} onChange={(e) => find(e.target.value)} data-testid="xp-word-find" />)}
            {found && !found.length ? <p className="a2-xs a2-mute xpb-mt6">{w('wordNone')}</p> : null}
            {found?.length ? (
              <ul className="xpb-rows" data-testid="xp-word-found">
                {found
                  .filter((f) => !words.some(([k]) => k === f.key))
                  .map((f) => (
                    <li key={f.key} className="xpb-row">
                      <span className="a2-sm xpb-grow">
                        {f.en} · {f.bn} <span className="a2-xs a2-mute a2-mono">{f.key}</span>
                      </span>
                      <button
                        type="button"
                        className="a2-btn"
                        onClick={() => {
                          setWords([...words, [f.key, { en: '', bn: '' }]]);
                          setShop({ ...shop, [f.key]: { en: f.en, bn: f.bn } });
                          find('');
                        }}
                      >
                        {w('wordAdd')}
                      </button>
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>

      {ro ? null : (
        <div className="a2-gap8 xpb-wrap a2-mt12">
          <button type="button" className="a2-btn pri" disabled={busy} onClick={save} data-testid="xp-save">
            {busy ? w('saving') : w('save')}
          </button>
        </div>
      )}
      {said ? (
        <p className={`a2-xs ${said.bad ? 'xpb-bad' : 'a2-mute'} xpb-mt6`} role="status" data-testid="xp-editor-said">
          {said.text}
        </p>
      ) : null}
    </div>
  );
}
