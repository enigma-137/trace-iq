import { DocsExplorer, FALLBACK_PROJECT_ID, FALLBACK_SNIPPET, apiBaseUrl, resolveActiveId } from './content';
import { PublicDocsHeader } from './PublicDocsHeader';

export default function PublicDocsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const activeId = resolveActiveId(searchParams);
  const isWelcome = activeId === 'welcome';

  return (
    <main className="min-h-screen bg-white text-neutral-900 dark:bg-slate-950 dark:text-slate-100">
      {isWelcome && <PublicDocsHeader />}
      <div className="mx-auto max-w-6xl px-5 py-10 md:px-8">
        {isWelcome && (
          <div className="mb-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400 dark:text-slate-500">Documentation</p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
              Everything you need to instrument TraceIQ
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-slate-400">
              Browse the full SDK and API reference before you sign up.{' '}
              <a className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/waitlist">
                Request early access
              </a>{' '}
              to get a project and write key.
            </p>
          </div>
        )}
        <DocsExplorer activeId={activeId} basePath="/docs" projectId={FALLBACK_PROJECT_ID} apiBaseUrl={apiBaseUrl} snippet={FALLBACK_SNIPPET} />
      </div>
    </main>
  );
}
