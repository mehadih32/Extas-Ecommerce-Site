'use client';
// The short message at the bottom of the product screens (demo zs-toast), the same as Keys & connections'.
import { useEffect, useRef, useState } from 'react';

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
