// S12 · PR 245 — the publish calendar: GET the days ahead, the month and the finished articles (`blog.read`); POST
// {action: 'fill', postId?} places finished articles in the free times (`blog.publish`); PUT the calendar's card
// `blog.schedule` (`blog.publish`) (lib/journal/schedule.ts).
import { adminDeps } from '@/lib/admin-auth';
import { calendarHandler } from '@/lib/journal/schedule';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return calendarHandler(request, adminDeps());
}

export function POST(request: Request) {
  return calendarHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return calendarHandler(request, adminDeps());
}
