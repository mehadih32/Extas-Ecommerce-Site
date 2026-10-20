import { redirect } from 'next/navigation';
import { ADMIN_HOME } from '@/lib/admin-nav';

// The admin's front door goes to its first page (the dashboard comes with its own PR).
export default function AdminHome() {
  redirect(ADMIN_HOME);
}
