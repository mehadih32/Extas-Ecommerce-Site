'use client';
// PR 6 (follow-up 84), PR 12 — SH-05, the guide panel "এই সেকশনে কী করা যায়": the Bengali guides of docs/admin-guide/,
// read from the server's deployed copy of the docs and drawn from the parsed blocks — never as HTML. A link to another
// guide opens it here; a web link opens in a new tab.
// PR 594 (CN-026): the guide of the page the person is on (GET /api/admin/guide?path=): the section's overview at the
// top, the section's other pages beside it (a tap reads that page's guide here, "Open this page" goes there), then the
// page's own guide in its six parts, with the Tip / Careful / Example boxes. Where it opens is `mode`
// (lib/admin-shell/help-pages.ts resolveGuideMode): on a computer a side panel that leaves the page usable beside it
// (no dimming, not modal: the person follows the steps on the page), on a phone a full-screen sheet. A palette result
// still opens one section guide by its file name (`slug`).
import Link from 'next/link';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Block, BoxKind, Guide, Inline } from '@/lib/admin-shell/guide';
import type { GuideMode } from '@/lib/admin-shell/help-pages';
import { t, type Dict } from '@/lib/i18n';
import { Drawer } from './Drawer';
import type { GuideRequest } from './events';
import { ShellIcon } from './ShellIcon';

/** Opens another guide in the panel: a section guide by its file name, or a page guide by its id. */
type OnGuide = (to: { slug?: string; page?: string }) => void;

function Inlines({ c, onGuide }: { c: Inline[]; onGuide: OnGuide }) {
  return (
    <>
      {c.map((x, i) => {
        if (x.t === 'text') return <Fragment key={i}>{x.v}</Fragment>;
        if (x.t === 'code') return <code key={i}>{x.v}</code>;
        if (x.t === 'b')
          return (
            <b key={i}>
              <Inlines c={x.c} onGuide={onGuide} />
            </b>
          );
        if (x.t === 'a')
          return (
            <a key={i} className="a2-lnk" href={x.href} target="_blank" rel="noopener noreferrer">
              <Inlines c={x.c} onGuide={onGuide} />
            </a>
          );
        return (
          <a
            key={i}
            href={x.t === 'page' ? `/admin/help#${x.id}` : `/admin/help#${x.slug}`}
            onClick={(e) => {
              e.preventDefault();
              onGuide(x.t === 'page' ? { page: x.id } : { slug: x.slug });
            }}
          >
            <Inlines c={x.c} onGuide={onGuide} />
          </a>
        );
      })}
    </>
  );
}

function Blocks({ blocks, onGuide, boxes }: { blocks: Block[]; onGuide: OnGuide; boxes: Record<BoxKind, string> }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h':
            return b.level <= 2 ? (
              <h3 key={i}>
                <Inlines c={b.c} onGuide={onGuide} />
              </h3>
            ) : (
              <h4 key={i}>
                <Inlines c={b.c} onGuide={onGuide} />
              </h4>
            );
          case 'p':
            return (
              <p key={i}>
                <Inlines c={b.c} onGuide={onGuide} />
              </p>
            );
          case 'pre':
            return <pre key={i}>{b.v}</pre>;
          case 'hr':
            return <hr key={i} className="a2-hr" />;
          case 'box':
            return (
              <div key={i} className={`a2-gbox ${b.kind}`} role="note">
                <b className="a2-gbox-t">{boxes[b.kind]}</b>
                <Blocks blocks={b.blocks} onGuide={onGuide} boxes={boxes} />
              </div>
            );
          case 'table':
            return (
              <div key={i} className="a2-gtbl">
                <table>
                  <thead>
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j}>
                          <Inlines c={c} onGuide={onGuide} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k}>
                            <Inlines c={c} onGuide={onGuide} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default: {
            const List = b.t;
            return (
              <List key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inlines c={it.c} onGuide={onGuide} />
                    {it.sub.length ? <Blocks blocks={it.sub} onGuide={onGuide} boxes={boxes} /> : null}
                  </li>
                ))}
              </List>
            );
          }
        }
      })}
    </>
  );
}

/** PR 387: the same drawing for the Site manual (components/admin/help/ManualChapter.tsx), so a guide looks alike in both. */
export { Blocks as GuideBlocks };
export type { OnGuide };

interface PageRow {
  id: string;
  title: string;
  href: string | null;
}

interface Loaded {
  key: string;
  failed: boolean;
  section?: string;
  page?: string | null;
  overview?: Guide | null;
  guide?: Guide | null;
  pages?: PageRow[];
}

const keyOf = (r: GuideRequest) => (r.slug ? `slug:${r.slug}` : r.page ? `page:${r.page}` : `path:${r.path ?? '/admin'}`);
const urlOf = (r: GuideRequest) =>
  r.slug ? `/api/admin/help/${encodeURIComponent(r.slug)}` : r.page ? `/api/admin/guide?page=${encodeURIComponent(r.page)}` : `/api/admin/guide?path=${encodeURIComponent(r.path ?? '/admin')}`;

/** The side panel of a computer: beside the page, not modal; Esc inside it or its close button closes it. */
function SidePanel({ title, sub, closeLabel, onClose, children }: { title: string; sub?: string; closeLabel: string; onClose(): void; children: ReactNode }) {
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = box.current;
    el?.querySelector<HTMLElement>('[data-a2-close]')?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && el?.contains(document.activeElement)) {
        ev.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <aside ref={box} className="a2-z a2-gside" aria-label={title} data-testid="ag-panel" data-mode="side">
      <div className="a2-drh">
        <div>
          <h2 className="a2-h3">{title}</h2>
          {sub ? <div className="a2-cs">{sub}</div> : null}
        </div>
        <button type="button" className="a2-icb" data-a2-close aria-label={closeLabel} onClick={onClose}>
          <ShellIcon name="x" size={18} />
        </button>
      </div>
      <div className="a2-drb">{children}</div>
    </aside>
  );
}

export function GuidePanel({ dict, request, mode = 'side', here, onOpen, onClose }: { dict: Dict; request: GuideRequest; mode?: GuideMode; here?: string; onOpen(r: GuideRequest): void; onClose(): void }) {
  const tt = (k: string, vars?: Record<string, string>) => t(dict, `shell.guide.${k}`, vars);
  const [state, setState] = useState<Loaded | null>(null);
  const key = keyOf(request);
  const url = urlOf(request);
  useEffect(() => {
    let live = true;
    fetch(url, { credentials: 'same-origin' })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as Omit<Loaded, 'key' | 'failed'> & { guide?: Guide | null };
        if (!live) return;
        if (!r.ok || !(j.guide || j.overview)) return setState({ key, failed: true });
        setState({ key, failed: false, ...j });
      })
      .catch(() => live && setState({ key, failed: true }));
    return () => {
      live = false;
    };
  }, [key, url]);
  const ready = state && state.key === key ? state : null;
  const boxes: Record<BoxKind, string> = { tip: tt('box.tip'), careful: tt('box.careful'), example: tt('box.example') };
  const toSlug: OnGuide = (to) => onOpen({ ...to, section: request.section });
  const sectionName = ready?.section ? t(dict, `shell.sec.${ready.section}`) : request.section;
  const title = tt('title', { section: sectionName });
  const current = ready?.pages?.find((p) => p.id === ready.page) ?? null;

  let body: ReactNode;
  if (!ready) body = <p className="a2-mute">{tt('loading')}</p>;
  else if (ready.failed) body = <p className="a2-mute" role="alert">{tt('error')}</p>;
  else if (request.slug) body = ready.guide ? <Blocks blocks={ready.guide.blocks} onGuide={toSlug} boxes={boxes} /> : null;
  else {
    const pages = ready.pages ?? [];
    body = (
      <>
        {ready.overview ? (
          <details className="a2-gov" open={!ready.guide} data-testid="ag-overview">
            <summary>
              <ShellIcon name="layers" size={16} />
              <span>{ready.overview.title}</span>
              <ShellIcon name="cd" size={15} />
            </summary>
            <div className="a2-govb">
              <Blocks blocks={ready.overview.blocks} onGuide={toSlug} boxes={boxes} />
            </div>
          </details>
        ) : null}
        {pages.length > 1 ? (
          <nav className="a2-gpages" aria-label={tt('pages')} data-testid="ag-pages">
            <div className="a2-gpl">{tt('pages')}</div>
            <ul>
              {pages.map((p) => (
                <li key={p.id}>
                  <button type="button" className={p.id === ready.page ? 'on' : ''} aria-current={p.id === ready.page ? 'true' : undefined} onClick={() => onOpen({ page: p.id, section: request.section })}>
                    {p.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {ready.guide ? (
          <article className="a2-gpage" data-testid="ag-page" data-page={ready.page ?? undefined}>
            <h3 className="a2-gpt">{ready.guide.title}</h3>
            {current?.href && current.href !== here ? (
              <Link className="a2-btn a2-gopen" href={current.href}>
                <ShellIcon name="enter" size={15} />
                {tt('openPage')}
              </Link>
            ) : null}
            <Blocks blocks={ready.guide.blocks} onGuide={toSlug} boxes={boxes} />
          </article>
        ) : null}
      </>
    );
  }
  const content = (
    <div className="a2-guidebody" lang="bn">
      {body}
    </div>
  );
  const sub = request.slug ? ready?.guide?.title : (current?.title ?? ready?.overview?.title);
  if (mode === 'side')
    return (
      <SidePanel title={title} sub={sub} closeLabel={tt('close')} onClose={onClose}>
        {content}
      </SidePanel>
    );
  return (
    <Drawer title={title} sub={sub} closeLabel={tt('close')} onClose={onClose} testId="ag-panel" wide full>
      {content}
    </Drawer>
  );
}
