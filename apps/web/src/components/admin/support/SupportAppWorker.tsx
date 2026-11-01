'use client';
// S22 · PR 435 — registers the support app's service worker on every support page while the app is offered, so the
// browser can install it and a notification's tap opens the chat. Nothing else; it renders nothing.
import { useEffect } from 'react';

export function SupportAppWorker({ worker, scope }: { worker: string; scope: string }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(worker, { scope }).catch(() => undefined);
  }, [worker, scope]);
  return null;
}
