'use client';

import { InputHTMLAttributes, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import ViewIcon from '@hugeicons/core-free-icons/ViewIcon';
import ViewOffSlashIcon from '@hugeicons/core-free-icons/ViewOffSlashIcon';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

// A password field with a show/hide toggle. `className` styles the input itself.
export function PasswordInput({ className = '', ...props }: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative grid">
      <input {...props} type={isVisible ? 'text' : 'password'} className={`${className} w-full pr-11`} />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-neutral-400 transition hover:text-neutral-900 focus-visible:text-neutral-900 focus-visible:outline-none dark:text-neutral-500 dark:hover:text-white dark:focus-visible:text-white"
        onClick={() => setIsVisible((visible) => !visible)}
        aria-label={isVisible ? 'Hide password' : 'Show password'}
        aria-pressed={isVisible}
        aria-controls={props.id}
        title={isVisible ? 'Hide password' : 'Show password'}
      >
        <HugeiconsIcon icon={isVisible ? ViewOffSlashIcon : ViewIcon} size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );
}
