'use client';
// S28 · PR 707 — the Admin map's page: a search box over the tasks and pages, then the sections in their groups, each
// page with its one line and who can open it. The data is made on the server (lib/admin-map.ts); this only filters it.
import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { searchMap } from '@/lib/admin-map';

export interface MapScreenPage {
  key: string;
  href: string;
  name: string;
  line: string;
  who: string;
  section: string;
}
export interface MapScreenSection {
  id: string;
  name: string;
  href: string;
  pages: MapScreenPage[];
}
export interface MapScreenGroup {
  id: string;
  name: string;
  sections: MapScreenSection[];
}
export interface MapScreenTask {
  id: string;
  name: string;
  where: string;
  href: string;
}
export interface MapScreenProps {
  groups: MapScreenGroup[];
  tasks: MapScreenTask[];
  text: { search: string; hint: string; noMatch: string; tasks: string; pages: string; open: string; who: string };
}

export function AdminMapScreen({ groups, tasks, text }: MapScreenProps) {
  const id = useId();
  const [q, setQ] = useState('');
  const pages = useMemo(() => groups.flatMap((g) => g.sections.flatMap((s) => s.pages.map((p) => ({ ...p, secName: s.name })))), [groups]);
  const hits = useMemo(() => {
    if (!q.trim()) return null;
    const ids = new Set(searchMap(q, [...tasks.map((x) => ({ id: `t:${x.id}`, hay: `${x.name} ${x.where}` })), ...pages.map((p) => ({ id: `p:${p.key}`, hay: `${p.name} ${p.line} ${p.secName}` }))]));
    return { tasks: tasks.filter((x) => ids.has(`t:${x.id}`)), pages: pages.filter((p) => ids.has(`p:${p.key}`)) };
  }, [q, tasks, pages]);
  return (
    <div data-testid="admin-map">
      <div className="a2-fld a2-mt12">
        <label className="a2-lbl" htmlFor={`${id}-q`}>
          {text.search}
        </label>
        <input id={`${id}-q`} className="a2-inp" type="search" value={q} placeholder={text.hint} autoComplete="off" onChange={(e) => setQ(e.target.value)} data-testid="map-search" />
      </div>
      {hits ? (
        <section className="a2-card a2-mt12" data-testid="map-results">
          {hits.tasks.length + hits.pages.length === 0 ? <p className="a2-sm a2-mute">{text.noMatch}</p> : null}
          {hits.tasks.length ? (
            <>
              <h2 className="a2-h3">{text.tasks}</h2>
              <ul className="s28-list">
                {hits.tasks.map((x) => (
                  <li key={x.id}>
                    <Link href={x.href}>{x.name}</Link>
                    <span className="a2-xs a2-mute">{x.where}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {hits.pages.length ? (
            <>
              <h2 className="a2-h3">{text.pages}</h2>
              <ul className="s28-list">
                {hits.pages.map((p) => (
                  <li key={p.key}>
                    <Link href={p.href}>
                      {p.secName} › {p.name}
                    </Link>
                    <span className="a2-xs a2-mute">{p.line}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : (
        groups.map((g) => (
          <section key={g.id} className="a2-mt12" data-testid={`map-group-${g.id}`}>
            <h2 className="a2-h3">{g.name}</h2>
            <div className="s28-grid">
              {g.sections.map((s) => (
                <div key={s.id} className="a2-card">
                  <h3 className="a2-h3">
                    <Link href={s.href}>{s.name}</Link>
                  </h3>
                  <ul className="s28-list">
                    {s.pages.map((p) => (
                      <li key={p.key}>
                        <div className="s28-grow">
                          <Link href={p.href}>{p.name}</Link>
                          <div className="a2-xs a2-mute">{p.line}</div>
                          <div className="a2-xs a2-mute">
                            {text.who}: {p.who}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
