'use client';
// S06 · PR 550 — the owner's sub-area list; PR 502 — the whole area admin on the new shell (demo V12.3
// #/admin/delivery/zones "Areas": add area · rename / merge / move). Find a place (prefix only, the matching checkout's
// autocomplete uses; on Find or Enter, never on a timer) and open it in a drawer: rename it (the old name stays a
// spelling unless unticked), edit its other spellings, move it to a band or back to the map, merge it into another
// spelling of the same place (archived, never deleted). "Add a place" puts a place the list lacks inside another one.
// Below, the owner's list: the exception to the map, with "Take off" (archived) and "Put back". Changing needs
// `delivery.areas`; the server checks it again.
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { ListedPlace, PlaceAnswer, PlaceDetail } from '@extas/delivery';
import { t, type Dict } from '@/lib/i18n';
import { call, type Answer } from '../api';
import { Drawer } from '../shell/Drawer';
import { ShellIcon } from '../shell/ShellIcon';
import { aliasesOf, nameOf, placeLabel, placeLine, refusalText, type Lang } from './model';

/** A band the owner can move a place to (its id and its name in the admin's language). */
export interface BandChoice {
  id: string;
  name: string;
}

interface Props {
  dict: Dict;
  lang: Lang;
  areas: ListedPlace[];
  bands: BandChoice[];
  canEdit: boolean;
}

type Said = { text: string; bad: boolean } | null;
/** A call to the API, run later. */
type Ask = () => Reply;
type Reply = Promise<Answer>;
type Done = Promise<boolean>;

const placesUrl = (q: string) => `/api/admin/delivery/places?q=${encodeURIComponent(q)}`;

/** The search box with its Find button (the form is sent on Enter too). */
function Find({ d, id, label, placeholder, onFound, testId }: { d: Dict; id: string; label: string; placeholder: string; onFound(places: PlaceAnswer[] | null, error: string): void; testId?: string }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const search = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const text = q.trim();
    if (!text) return;
    setBusy(true);
    const a = await call('GET', placesUrl(text));
    setBusy(false);
    if (a.status === 200) onFound(a.data.places as PlaceAnswer[], '');
    else onFound(null, refusalText(d, a.data.error, a.data.details));
  };
  return (
    <form onSubmit={search} role="search">
      <label className="a2-lbl" htmlFor={id}>
        {label}
      </label>
      <div className="dz-find a2-mt6">
        <input id={id} className="a2-inp" type="search" value={q} placeholder={placeholder} autoComplete="off" spellCheck={false} onChange={(e) => setQ(e.target.value)} data-testid={testId} />
        <button type="submit" className="a2-btn pri" disabled={busy || !q.trim()}>
          <ShellIcon name="search" size={15} />
          {t(d, 'delivery.list.find')}
        </button>
      </div>
    </form>
  );
}

export function AreaAdmin({ dict: d, lang, areas, bands, canEdit }: Props) {
  const router = useRouter();
  const [found, setFound] = useState<PlaceAnswer[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<Said>(null);
  const [showOff, setShowOff] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const live = areas.filter((a) => !a.archived);
  const off = areas.filter((a) => a.archived);
  const listed = new Set(live.map((a) => a.id));
  const bandName = (id: string | null, key: string | null) => (id ? (bands.find((b) => b.id === id)?.name ?? key ?? '') : '');

  const change = async (key: string, name: string, run: Ask, done: string) => {
    setBusy(key);
    setSaid(null);
    const a = await run();
    setBusy(null);
    if (a.status === 200 || a.status === 201) {
      setSaid({ text: t(d, done, { name }), bad: false });
      router.refresh();
    } else setSaid({ text: refusalText(d, a.data.error, a.data.details), bad: true });
  };
  const add = (p: { id: string; nameEn: string; nameBn: string | null }) => change(p.id, nameOf(lang, p), () => call('POST', '/api/admin/delivery/areas', { areaId: p.id }), 'delivery.list.added');
  const remove = (p: ListedPlace) => change(p.id, nameOf(lang, p), () => call('PATCH', `/api/admin/delivery/areas/${encodeURIComponent(p.id)}`, { archived: true }), 'delivery.list.removed');
  const done = (text: string) => {
    setSaid({ text, bad: false });
    setFound(null);
    router.refresh();
  };

  const openBtn = (id: string) => (
    <button type="button" className="a2-btn" onClick={() => setOpened(id)} data-testid="dz-open">
      {t(d, 'delivery.list.open')}
    </button>
  );
  const row = (p: ListedPlace) => (
    <li key={p.id} className="dz-li" data-testid="dl-listed">
      <div className="dz-main">
        <b>{nameOf(lang, p)}</b>
        <div className="a2-xs a2-mute">
          {placeLine(d, lang, p)}
          {p.missing ? `${t(d, 'delivery.sep')}${t(d, 'delivery.list.missing')}` : ''}
        </div>
      </div>
      {p.archived ? <span className="a2-pill">{t(d, 'delivery.list.offTag')}</span> : <span className="a2-pill ok">{bandName(p.bandId, p.bandKey)}</span>}
      <div className="dz-acts">
        {p.missing ? null : openBtn(p.id)}
        {canEdit ? (
          p.archived ? (
            <button type="button" className="a2-btn" disabled={busy === p.id || p.missing} onClick={() => void add(p)}>
              {t(d, 'delivery.list.putBack')}
            </button>
          ) : (
            <button type="button" className="a2-btn" disabled={busy === p.id} onClick={() => void remove(p)}>
              {t(d, 'delivery.list.remove')}
            </button>
          )
        ) : null}
      </div>
    </li>
  );

  return (
    <section className="a2-sc" aria-labelledby="dl-list-h" data-testid="dz-areas">
      <div className="a2-sch">
        <div>
          <h2 className="a2-h3" id="dl-list-h">
            {t(d, 'delivery.list.title')}
          </h2>
          <p className="a2-scd">{t(d, 'delivery.list.sub')}</p>
        </div>
        {canEdit ? (
          <button type="button" className="a2-btn" onClick={() => setAdding(true)} data-testid="dz-add">
            <ShellIcon name="plus" size={15} />
            {t(d, 'delivery.list.addPlace')}
          </button>
        ) : null}
      </div>
      <div className="a2-mt12">
        <Find
          d={d}
          id="dz-q"
          label={t(d, 'delivery.list.search')}
          placeholder={t(d, 'delivery.list.placeholder')}
          testId="dz-q"
          onFound={(places, error) => {
            setFound(places);
            setSaid(error ? { text: error, bad: true } : null);
          }}
        />
      </div>
      {found ? (
        <div className="dz-found" aria-live="polite">
          {found.length ? (
            <ul className="dz-list">
              {found.map((p) => {
                const band = bandName(p.bandId, p.bandKey);
                return (
                  <li key={p.id} className="dz-li" data-testid="dl-found">
                    <div className="dz-main">
                      <b>{nameOf(lang, p)}</b>
                      <div className="a2-xs a2-mute">
                        {placeLine(d, lang, p)}
                        {band ? `${t(d, 'delivery.sep')}${t(d, 'delivery.list.now', { band })}` : ''}
                        {p.via ? ` (${t(d, `delivery.list.via.${p.via}`)})` : ''}
                        {p.spans > 1 ? `${t(d, 'delivery.sep')}${t(d, 'delivery.list.spans')}` : ''}
                      </div>
                    </div>
                    <div className="dz-acts">
                      {openBtn(p.id)}
                      {listed.has(p.id) ? (
                        <span className="a2-pill ok">{t(d, 'delivery.list.onList')}</span>
                      ) : canEdit ? (
                        <button type="button" className="a2-btn" disabled={busy === p.id} onClick={() => void add(p)}>
                          {t(d, 'delivery.list.add')}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="a2-xs a2-mute">{t(d, 'delivery.list.none')}</p>
          )}
        </div>
      ) : null}
      <div className={`dz-said${said?.bad ? ' bad' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="dz-areas-status">
        {said?.text ?? ''}
      </div>

      <h3 className="a2-h4 dz-mine">{t(d, 'delivery.list.mine')}</h3>
      {live.length ? <ul className="dz-list">{live.map(row)}</ul> : <p className="a2-xs a2-mute a2-mt6">{t(d, 'delivery.list.empty')}</p>}
      {off.length ? (
        <>
          <label className="a2-chkl a2-mt6">
            <input type="checkbox" className="a2-chk" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} />
            <span>{t(d, 'delivery.list.showOff')}</span>
          </label>
          {showOff ? <ul className="dz-list">{off.map(row)}</ul> : null}
        </>
      ) : null}
      {opened ? <PlaceDrawer d={d} lang={lang} id={opened} bands={bands} canEdit={canEdit} onClose={() => setOpened(null)} onChanged={done} /> : null}
      {adding ? (
        <AddDrawer
          d={d}
          lang={lang}
          bands={bands}
          onClose={() => setAdding(false)}
          onAdded={(p) => {
            setAdding(false);
            done(t(d, 'delivery.add.added', { name: nameOf(lang, p) }));
          }}
        />
      ) : null}
    </section>
  );
}

/** One place: its names, spellings, band and merge, each saved on its own. */
function PlaceDrawer({ d, lang, id, bands, canEdit, onClose, onChanged }: { d: Dict; lang: Lang; id: string; bands: BandChoice[]; canEdit: boolean; onClose(): void; onChanged(text: string): void }) {
  const [p, setP] = useState<PlaceDetail | null>(null);
  const [nameEn, setNameEn] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [keepOld, setKeepOld] = useState(true);
  const [spellings, setSpellings] = useState('');
  const [band, setBand] = useState('');
  const [targets, setTargets] = useState<PlaceAnswer[] | null>(null);
  const [into, setInto] = useState<PlaceAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said>(null);

  const show = useCallback((x: PlaceDetail) => {
    setP(x);
    setNameEn(x.nameEn);
    setNameBn(x.nameBn ?? '');
    setSpellings(x.aliases.join('\n'));
    setBand(x.listed && !x.listed.archived ? x.listed.bandId : '');
  }, []);
  useEffect(() => {
    let live = true;
    void call('GET', `/api/admin/delivery/places/${encodeURIComponent(id)}`).then((a) => {
      if (!live) return;
      if (a.status === 200) show(a.data.place as PlaceDetail);
      else setSaid({ text: refusalText(d, a.data.error, a.data.details), bad: true });
    });
    return () => {
      live = false;
    };
  }, [id, d, show]);

  const run = async (req: Ask, ok: (a: Answer) => string, keepOpen = true): Done => {
    setBusy(true);
    setSaid(null);
    const a = await req();
    setBusy(false);
    if (a.status !== 200 && a.status !== 201) {
      setSaid({ text: refusalText(d, a.data.error, a.data.details), bad: true });
      return false;
    }
    if (keepOpen && a.data.place) show(a.data.place as PlaceDetail);
    const text = ok(a);
    if (keepOpen) setSaid({ text, bad: false });
    onChanged(text);
    return true;
  };
  const url = `/api/admin/delivery/places/${encodeURIComponent(id)}`;
  const name = p ? nameOf(lang, p) : '';
  const saveName = () => run(() => call('PATCH', url, { nameEn: nameEn.trim(), nameBn: nameBn.trim() || null, keepOld }), (a) => t(d, 'delivery.place.renamed', { name: nameOf(lang, a.data.place as PlaceDetail) }));
  const saveSpellings = () => run(() => call('PATCH', url, { aliases: aliasesOf(spellings) }), () => t(d, 'delivery.place.spelt', { name }));
  const saveBand = () =>
    run(
      async () => {
        const a = band ? await call('POST', '/api/admin/delivery/areas', { areaId: id, bandId: band }) : await call('PATCH', `/api/admin/delivery/areas/${encodeURIComponent(id)}`, { archived: true });
        if (a.status !== 200 && a.status !== 201) return a;
        return call('GET', url);
      },
      () => t(d, 'delivery.place.moved', { name }),
    );
  const merge = async (target: PlaceAnswer) => {
    if (await run(() => call('POST', `${url}/merge`, { intoId: target.id }), () => t(d, 'delivery.place.merged', { from: name, into: nameOf(lang, target) }), false)) onClose();
  };

  const listedLive = p?.listed && !p.listed.archived ? p.listed.bandId : '';
  return (
    <Drawer title={p ? t(d, 'delivery.place.title', { name }) : t(d, 'delivery.place.loading')} sub={p ? placeLine(d, lang, p) : undefined} closeLabel={t(d, 'delivery.edit.close')} onClose={onClose} testId="dz-place" wide>
      {p ? (
        <>
          <div className="dz-sec">
            <div className="a2-xs a2-mute">
              {t(d, 'delivery.place.now', { band: bands.find((b) => b.id === p.now.bandId)?.name ?? p.now.bandKey ?? '', via: p.now.via ? t(d, `delivery.list.via.${p.now.via}`) : '' })}
              {p.children ? `${t(d, 'delivery.sep')}${t(d, 'delivery.place.under', { n: String(p.children) })}` : ''}
              {p.ownerMade ? `${t(d, 'delivery.sep')}${t(d, 'delivery.place.ownerMade')}` : ''}
            </div>
          </div>
          <div className="dz-sec">
            <h3 className="a2-h4">{t(d, 'delivery.place.names')}</h3>
            <div className="a2-fld a2-mt6">
              <label className="a2-lbl" htmlFor="dz-en">
                {t(d, 'delivery.place.nameEn')}
              </label>
              <input id="dz-en" className="a2-inp" value={nameEn} maxLength={120} disabled={!canEdit || busy} onChange={(e) => setNameEn(e.target.value)} data-testid="dz-name-en" />
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="dz-bn">
                {t(d, 'delivery.place.nameBn')}
              </label>
              <input id="dz-bn" className="a2-inp" lang="bn" value={nameBn} maxLength={120} disabled={!canEdit || busy} onChange={(e) => setNameBn(e.target.value)} />
            </div>
            {canEdit ? (
              <>
                <label className="a2-chkl a2-mt6">
                  <input type="checkbox" className="a2-chk" checked={keepOld} onChange={(e) => setKeepOld(e.target.checked)} />
                  <span>{t(d, 'delivery.place.keepOld')}</span>
                </label>
                <div className="dz-row">
                  <button type="button" className="a2-btn pri" disabled={busy || !nameEn.trim() || (nameEn.trim() === p.nameEn && (nameBn.trim() || null) === p.nameBn)} onClick={() => void saveName()} data-testid="dz-save-name">
                    {t(d, 'delivery.place.saveName')}
                  </button>
                </div>
              </>
            ) : null}
          </div>
          <div className="dz-sec">
            <label className="a2-h4 a2-blk" htmlFor="dz-sp">
              {t(d, 'delivery.place.spellings')}
            </label>
            <span className="a2-xs a2-mute a2-blk">{t(d, 'delivery.place.spellingsHelp')}</span>
            <textarea id="dz-sp" className="a2-ta a2-mt6" rows={4} value={spellings} disabled={!canEdit || busy} onChange={(e) => setSpellings(e.target.value)} data-testid="dz-spellings" />
            {canEdit ? (
              <div className="dz-row">
                <button type="button" className="a2-btn pri" disabled={busy || spellings === p.aliases.join('\n')} onClick={() => void saveSpellings()} data-testid="dz-save-spellings">
                  {t(d, 'delivery.place.saveSpellings')}
                </button>
              </div>
            ) : null}
          </div>
          <div className="dz-sec">
            <label className="a2-h4 a2-blk" htmlFor="dz-band">
              {t(d, 'delivery.place.band')}
            </label>
            <span className="a2-xs a2-mute a2-blk">{t(d, 'delivery.place.bandHelp')}</span>
            <div className="dz-row">
              <select id="dz-band" className="a2-sel" value={band} disabled={!canEdit || busy} onChange={(e) => setBand(e.target.value)} data-testid="dz-band">
                <option value="">{t(d, 'delivery.place.byMap')}</option>
                {bands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {canEdit ? (
                <button type="button" className="a2-btn pri" disabled={busy || band === listedLive} onClick={() => void saveBand()} data-testid="dz-save-band">
                  {t(d, 'delivery.place.saveBand')}
                </button>
              ) : null}
            </div>
          </div>
          {canEdit ? (
            <div className="dz-sec">
              <h3 className="a2-h4">{t(d, 'delivery.place.merge')}</h3>
              <p className="a2-xs a2-mute">{t(d, 'delivery.place.mergeHelp')}</p>
              <div className="a2-mt6">
                <Find
                  d={d}
                  id="dz-mq"
                  label={t(d, 'delivery.place.mergeFind')}
                  placeholder={p.nameEn}
                  onFound={(places, error) => {
                    setTargets(places ? places.filter((x) => x.id !== p.id && x.level === p.level) : null);
                    setInto(null);
                    if (error) setSaid({ text: error, bad: true });
                  }}
                />
              </div>
              {targets ? (
                <div className="dz-found">
                  <p className="a2-xs a2-mute a2-mt6">{t(d, 'delivery.place.mergeSameKind')}</p>
                  {targets.length ? (
                    <ul className="dz-list">
                      {targets.map((x) => (
                        <li key={x.id} className="dz-li">
                          <div className="dz-main">
                            <b>{placeLabel(lang, x)}</b>
                            <div className="a2-xs a2-mute">{placeLine(d, lang, x)}</div>
                          </div>
                          <button type="button" className={`a2-btn${into?.id === x.id ? ' badf' : ' bad'}`} disabled={busy} onClick={() => (into?.id === x.id ? void merge(x) : setInto(x))} data-testid="dz-merge">
                            {t(d, 'delivery.place.mergeInto', { name: nameOf(lang, x) })}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="a2-xs a2-mute">{t(d, 'delivery.list.none')}</p>
                  )}
                  {into ? (
                    <div className="a2-note warn">
                      <ShellIcon name="info" size={15} />
                      <span>{t(d, 'delivery.place.mergeHelp')}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      <div className={`dz-said${said?.bad ? ' bad' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="dz-place-status">
        {said?.text ?? ''}
      </div>
    </Drawer>
  );
}

/** A place the list lacks: inside which place, its names, its spellings and (optionally) its band. */
function AddDrawer({ d, lang, bands, onClose, onAdded }: { d: Dict; lang: Lang; bands: BandChoice[]; onClose(): void; onAdded(p: PlaceDetail): void }) {
  const [parents, setParents] = useState<PlaceAnswer[] | null>(null);
  const [parent, setParent] = useState<PlaceAnswer | null>(null);
  const [nameEn, setNameEn] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [spellings, setSpellings] = useState('');
  const [band, setBand] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!parent) return setError(t(d, 'delivery.add.needParent'));
    setBusy(true);
    setError('');
    const a = await call('POST', '/api/admin/delivery/places', { parentId: parent.id, nameEn: nameEn.trim(), nameBn: nameBn.trim() || null, aliases: aliasesOf(spellings), ...(band ? { bandId: band } : {}) });
    setBusy(false);
    if (a.status === 201) onAdded(a.data.place as PlaceDetail);
    else setError(refusalText(d, a.data.error, a.data.details));
  };

  return (
    <Drawer
      title={t(d, 'delivery.add.title')}
      sub={t(d, 'delivery.add.desc')}
      closeLabel={t(d, 'delivery.edit.close')}
      onClose={onClose}
      testId="dz-add-drawer"
      foot={
        <>
          <button type="button" className="a2-btn" onClick={onClose}>
            {t(d, 'delivery.edit.cancel')}
          </button>
          <button type="button" className="a2-btn pri" disabled={busy || !nameEn.trim()} onClick={() => void save()} data-testid="dz-add-save">
            {t(d, 'delivery.add.save')}
          </button>
        </>
      }
    >
      <div className="dz-sec">
        {parent ? (
          <div className="a2-between">
            <b className="a2-sm">{t(d, 'delivery.add.parentPicked', { name: placeLabel(lang, parent) })}</b>
            <button type="button" className="a2-btn ghost" onClick={() => setParent(null)}>
              {t(d, 'delivery.bands.change')}
            </button>
          </div>
        ) : (
          <>
            <Find d={d} id="dz-pq" label={t(d, 'delivery.add.parent')} placeholder={t(d, 'delivery.list.placeholder')} onFound={(places, e) => {
                setParents(places);
                setError(e);
              }} testId="dz-parent-q" />
            {parents ? (
              <div className="dz-found">
                {parents.length ? (
                  <ul className="dz-list">
                    {parents.map((x) => (
                      <li key={x.id} className="dz-li">
                        <div className="dz-main">
                          <b>{nameOf(lang, x)}</b>
                          <div className="a2-xs a2-mute">{placeLine(d, lang, x)}</div>
                        </div>
                        <button type="button" className="a2-btn" onClick={() => setParent(x)} data-testid="dz-parent-pick">
                          {t(d, 'delivery.add.parentPick')}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="a2-xs a2-mute">{t(d, 'delivery.list.none')}</p>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
      <div className="dz-sec">
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor="dz-aen">
            {t(d, 'delivery.place.nameEn')}
          </label>
          <input id="dz-aen" className="a2-inp" value={nameEn} maxLength={120} onChange={(e) => setNameEn(e.target.value)} data-testid="dz-add-en" />
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor="dz-abn">
            {t(d, 'delivery.place.nameBn')}
          </label>
          <input id="dz-abn" className="a2-inp" lang="bn" value={nameBn} maxLength={120} onChange={(e) => setNameBn(e.target.value)} />
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor="dz-asp">
            {t(d, 'delivery.place.spellings')}
          </label>
          <textarea id="dz-asp" className="a2-ta" rows={3} value={spellings} onChange={(e) => setSpellings(e.target.value)} />
          <span className="a2-xs a2-mute">{t(d, 'delivery.place.spellingsHelp')}</span>
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor="dz-aband">
            {t(d, 'delivery.place.band')}
          </label>
          <select id="dz-aband" className="a2-sel" value={band} onChange={(e) => setBand(e.target.value)}>
            <option value="">{t(d, 'delivery.place.byMap')}</option>
            {bands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        {error ? (
          <p className="dz-said bad" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
