'use client';
// The short message at the bottom of the product screens (demo zs-toast), the same as Keys & connections'.
import { useEffect, useRef, useState } from 'react';
import { showToast, type ToastUndo } from '../lumen/Toast';

const TOAST_MS = 3200;

export function useToast(): [string, (text: string) => void] {
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = (text: string) => {
    clearTimeout(timer.current);
    setToast(text);
    timer.current = setTimeout(() => setToast(''), TOAST_MS);
  };
  return [toast, say];
}

/** PR 634 (CN-036): the product screens speak through the admin's one toast (components/admin/lumen/Toast.tsx, drawn
 *  by the shell and read out by screen readers). `undo` is offered only for a reversible kind (lib/admin-lumen/safety.ts). */
export function say(text: string, undo?: ToastUndo): void {
  showToast({ text, undo });
}

/** A refusal: the same toast in the "bad" tone. */
export function sayBad(text: string): void {
  showToast({ text, tone: 'bad' });
}
