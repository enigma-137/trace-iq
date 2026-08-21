import { resolveActiveId } from './content';
import { DocsPageClient } from './DocsPageClient';

export default function PublicDocsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const activeId = resolveActiveId(searchParams);
  return <DocsPageClient activeId={activeId} />;
}
