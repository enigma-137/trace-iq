import Link from 'next/link';

export const metadata = {
  title: 'Privacy and data collection',
  description: 'What TraceIQ collects by default and what deployment operators control.'
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white px-5 py-12 text-neutral-900 dark:bg-slate-950 dark:text-slate-100 sm:px-8">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-300">
          ← TraceIQ
        </Link>
        <h1 className="mt-8 text-3xl font-bold tracking-tight sm:text-4xl">Privacy and data collection</h1>
        <p className="mt-4 text-sm leading-7 text-neutral-600 dark:text-slate-300">
          TraceIQ is self-hostable analytics software. This page describes its current defaults; it is not a compliance certification, legal advice, or a substitute for the deploying organization&apos;s privacy notice.
        </p>

        <Section title="Browser storage">
          <p>
            The JavaScript SDK does not set cookies. It stores a persistent anonymous identifier in <Code>localStorage</Code> and a visit-scoped session identifier in <Code>sessionStorage</Code> when browser storage is available. Laws concerning cookies may also cover these similar storage technologies.
          </p>
        </Section>

        <Section title="Information that can be collected">
          <ul>
            <li>Anonymous, session, project, and optional user identifiers</li>
            <li>Configured page views, custom events, properties, user traits, and group traits</li>
            <li>URLs, paths, query strings, referrers, and page titles</li>
            <li>User agent, browser, operating system, locale, viewport, timezone, and connection type</li>
            <li>Request IP address and approximate geography added by the API</li>
            <li>Exception messages and stacks, plus optional API request paths, statuses, and durations</li>
          </ul>
          <p>
            These fields can contain personal or sensitive data. Do not send secrets, passwords, access tokens, full payment-card data, or information that is unnecessary for your stated analytics purpose.
          </p>
        </Section>

        <Section title="Operator responsibilities">
          <p>
            The organization deploying TraceIQ controls what is collected and is responsible for data minimization, notices, consent or another legal basis, retention, access and deletion requests, webhook recipients, security, and other requirements that apply to its users and jurisdictions.
          </p>
          <p>
            TraceIQ does not make an implementation automatically GDPR, CCPA, PECR, or otherwise compliant. Automatic retention enforcement, a complete data-subject request workflow, IP anonymization, and consent management are not currently built in.
          </p>
        </Section>

        <p className="mt-10 border-t border-neutral-200 pt-6 text-sm leading-7 text-neutral-500 dark:border-slate-800 dark:text-slate-400">
          Repository operators can review the complete technical inventory in{' '}
          <a className="font-semibold text-blue-600 hover:underline dark:text-blue-300" href="https://github.com/enigma-137/trace-iq/blob/main/docs/privacy.md">
            docs/privacy.md
          </a>.
        </p>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 space-y-4 text-sm leading-7 text-neutral-600 dark:text-slate-300">
      <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">{title}</h2>
      {children}
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-900">{children}</code>;
}
