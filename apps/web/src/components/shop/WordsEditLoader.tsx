'use client';
// S02 · PR 79 — while `language.frontEdit` is on, every shop page carries this small switch: a page opened with
// ?words=edit (Website › Words & language → "Edit on the shop") starts editing for this tab, and the panel
// (components/shop/WordsEditPanel, its own chunk) loads only then. Without it a customer's page loads nothing more.
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const WordsEditPanel = dynamic(() => import('./WordsEditPanel').then((m) => m.WordsEditPanel), { ssr: false });
/** This tab is editing words (kept while the owner moves from page to page). */
const FLAG = 'extas_words_edit';
const PARAM = 'words';

function editing(): boolean {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(PARAM) === 'edit') {
      window.sessionStorage.setItem(FLAG, '1');
      url.searchParams.delete(PARAM);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    return window.sessionStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

export function WordsEditLoader() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setOn(editing()), 0);
    return () => window.clearTimeout(id);
  }, []);
  if (!on) return null;
  return (
    <WordsEditPanel
      onClose={() => {
        try {
          window.sessionStorage.removeItem(FLAG);
        } catch {
          /* a tab without storage simply stops here */
        }
        setOn(false);
      }}
    />
  );
}
