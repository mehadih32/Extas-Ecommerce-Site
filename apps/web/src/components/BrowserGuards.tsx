'use client';
// CN-053 — mounted once in the root layout: checks this browser's saved data (lib/storage-guard.ts) and reloads once
// when a tab from before a deploy asks for a file that is gone (lib/chunk-recovery.ts). Draws nothing.
import { useEffect } from 'react';
import bn from '../../messages/recover.bn.json';
import en from '../../messages/recover.en.json';
import { installChunkRecovery } from '@/lib/chunk-recovery';
import { runStorageGuard } from '@/lib/storage-guard';

export function BrowserGuards() {
  useEffect(() => {
    try {
      runStorageGuard();
    } catch {
      // never blocks a page
    }
    return installChunkRecovery(window as never, { bn: bn.updating, en: en.updating });
  }, []);
  return null;
}
