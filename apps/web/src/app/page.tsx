import { redirect } from 'next/navigation';

// Until the storefront (S02) exists, the home address shows the progress page.
export default function Home() {
  redirect('/status');
}
