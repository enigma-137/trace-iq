import { readChangelogEntries } from '@/lib/changelog-source';

// Built once per deploy. Read by the dashboard's "What's new" dot and the admin email digest.
export const dynamic = 'force-static';

export function GET() {
  return Response.json({ entries: readChangelogEntries() });
}
