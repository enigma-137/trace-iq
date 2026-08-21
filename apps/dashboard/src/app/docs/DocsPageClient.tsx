'use client';

import { useEffect, useState } from 'react';
import { PublicDocsHeader } from './PublicDocsHeader';
import { DocsExplorer, docsSections, FALLBACK_PROJECT_ID, FALLBACK_SNIPPET, apiBaseUrl } from './content';
import { DocsAiAssistant } from './DocsAiAssistant';
import { MobileToc } from './MobileToc';
import { DocsSearchModal } from './DocsSearchModal';

export function DocsPageClient({ activeId }: { activeId: string }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const currentId = docsSections.some((s) => s.id === activeId) ? activeId : docsSections[0].id;

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Top Header Navigation with Search Button */}
      <PublicDocsHeader onOpenSearch={() => setIsSearchOpen(true)} />

      {/* Main Documentation Body */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <MobileToc
          sections={docsSections}
          currentId={currentId}
          basePath="/docs"
          onOpenSearch={() => setIsSearchOpen(true)}
        />

        <DocsExplorer
          activeId={activeId}
          basePath="/docs"
          projectId={FALLBACK_PROJECT_ID}
          apiBaseUrl={apiBaseUrl}
          snippet={FALLBACK_SNIPPET}
          onOpenSearch={() => setIsSearchOpen(true)}
        />
      </main>

      {/* Floating AI Docs Assistant */}
      <DocsAiAssistant apiBaseUrl={apiBaseUrl} />

      {/* Ctrl+K Command Palette Search Modal */}
      <DocsSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        sections={docsSections}
        basePath="/docs"
      />
    </div>
  );
}
