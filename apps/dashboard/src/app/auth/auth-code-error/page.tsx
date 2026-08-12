import Link from 'next/link';

export default function AuthCodeErrorPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 text-neutral-950 dark:bg-black dark:text-neutral-50">
      <section className="grid w-full max-w-sm gap-4 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
          Sign-in failed
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t complete that sign-in.</h1>
        <p className="text-sm leading-6 text-neutral-500 dark:text-neutral-400">
          The authentication link expired, was already used, or was misconfigured. Try again — if it keeps failing,
          contact the project owner.
        </p>
        <Link
          className="mt-2 grid min-h-11 place-items-center rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
          href="/auth/login"
        >
          Back to sign in
        </Link>
      </section>
    </main>
  );
}