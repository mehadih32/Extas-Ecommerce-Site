'use client';
// S02 · PR 600 — the on-page edit mode's thin bar, drawn by the shop layout only for the signed-in owner while
// `shop.pageEdit` is on (lib/website/page-edit-shop). The bar and its side panel are their own chunk
// (components/shop/PageEditPanel), loaded only here; a customer's page never loads either. Not drawn inside the phone
// previews of "Apply to phone too?" (a frame of the same page).
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { EditPage } from '@/lib/website/page-edit-model';

// While the panel's chunk loads, the page already keeps room at its foot for the bar (the panel then measures it), so
// the bar never lands on the footer's last links.
const PageEditPanel = dynamic(() => import('./PageEditPanel').then((m) => m.PageEditPanel), {
  ssr: false,
  loading: () => <div aria-hidden="true" style={{ display: 'block', height: '10rem' }} />,
});

export function PageEditBar(p: { edit: boolean; page: EditPage; lang: 'en' | 'bn' }) {
  const [top, setTop] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setTop(window.self === window.top), 0);
    return () => window.clearTimeout(id);
  }, []);
  return top ? <PageEditPanel edit={p.edit} page={p.page} lang={p.lang} /> : null;
}
