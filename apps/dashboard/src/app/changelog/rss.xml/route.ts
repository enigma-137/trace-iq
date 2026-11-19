import { entryUrl, readChangelogEntries, SITE_URL } from '@/lib/changelog-source';

// Built once per deploy: entries only change when the site is redeployed.
export const dynamic = 'force-static';

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** CDATA can't contain "]]>", so split any occurrence across two sections. */
const cdata = (value: string) => `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

const rssDate = (date: string) => new Date(`${date}T12:00:00Z`).toUTCString();

/** RSS 2.0 feed of the changelog, newest first. */
export function GET() {
  const entries = readChangelogEntries();
  const items = entries
    .map(
      (entry) => `    <item>
      <title>${escapeXml(entry.title)}</title>
      <link>${entryUrl(entry.slug)}</link>
      <guid isPermaLink="true">${entryUrl(entry.slug)}</guid>
      <pubDate>${rssDate(entry.date)}</pubDate>
${entry.areas.map((area) => `      <category>${escapeXml(area)}</category>`).join('\n')}
      <description>${cdata(entry.html)}</description>
    </item>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>TraceIQ Changelog</title>
    <link>${SITE_URL}/changelog</link>
    <atom:link href="${SITE_URL}/changelog/rss.xml" rel="self" type="application/rss+xml" />
    <description>New features, improvements and fixes in TraceIQ.</description>
    <language>en</language>
    <lastBuildDate>${rssDate(entries[0]?.date ?? '1970-01-01')}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
