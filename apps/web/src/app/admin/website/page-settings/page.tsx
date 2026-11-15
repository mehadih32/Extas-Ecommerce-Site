// PR 740–744 — Website › Page settings: /admin/website/page-settings?screen=<screen> (home, category, product, thanks,
// bag, account, search, currency, email, cookie, appicon; no screen = home). The body is in ./screen-page.tsx.
import type { Metadata } from 'next';
import { ScreenPage, screenMetadata } from './screen-page';

export const dynamic = 'force-dynamic';

export const generateMetadata = (): Promise<Metadata> => screenMetadata();

export default async function PageSettingsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = (await props.searchParams).screen;
  return <ScreenPage asked={typeof q === 'string' && q ? q : 'home'} />;
}
