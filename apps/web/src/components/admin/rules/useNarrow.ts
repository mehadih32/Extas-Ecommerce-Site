'use client';
// PR 940 (lane D5): true on a phone or small tablet (860 px and below), where the prototype opens the editor of a row under the row
// (a sheet) instead of in the right-hand column. One editor at a time is drawn, so no field id is ever on the page twice.
import { useEffect, useState } from 'react';

const QUERY = '(max-width: 860px)'; // hardcode-ok: a layout breakpoint, the same one hub.css uses

export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(QUERY);
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}
