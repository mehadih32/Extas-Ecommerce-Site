'use client';
// Ends this session (POST /api/admin/auth/logout) and goes to the sign-in page.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { Icon } from './Icon';

export function LogoutButton({ label, className }: { label: string; className: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const out = async () => {
    setBusy(true);
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      router.replace(ADMIN_LOGIN);
      router.refresh();
    }
  };
  return (
    <button type="button" className={className} onClick={out} disabled={busy}>
      <Icon name="logout" />
      {label}
    </button>
  );
}
