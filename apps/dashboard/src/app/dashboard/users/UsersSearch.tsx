'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export function UsersSearch({ initialValue }: { initialValue: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (value.trim()) {
      params.set('search', value.trim());
    }
    router.push(`/dashboard/users${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        className="min-h-10 w-full max-w-sm rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-white dark:focus:ring-white/10"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search by user ID or anonymous ID"
      />
      <button
        type="submit"
        className="h-10 shrink-0 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
      >
        Search
      </button>
    </form>
  );
}
