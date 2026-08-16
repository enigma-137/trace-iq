'use client';

import * as Popover from '@radix-ui/react-popover';
import { useMemo, useRef, useState } from 'react';
import { cn } from './utils';

export interface ComboboxItem {
  value: string;
  label: string;
  description?: string;
}

export interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  items: ComboboxItem[];
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
  emptyLabel?: string;
  onValueCommit?: (value: string) => void;
}

export function Combobox({
  value,
  onChange,
  items,
  placeholder = 'Select…',
  className,
  'aria-label': ariaLabel,
  emptyLabel = 'No matches',
  onValueCommit
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q));
  }, [items, value]);

  function openList() {
    setHighlighted(0);
    setOpen(true);
  }

  function selectItem(item: ComboboxItem) {
    onChange(item.value);
    onValueCommit?.(item.value);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openList();
      setHighlighted((index) => Math.min(index + 1, Math.max(0, filtered.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openList();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      if (open && filtered[highlighted]) {
        event.preventDefault();
        selectItem(filtered[highlighted]);
      } else {
        onValueCommit?.(value);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else {
      openList();
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[highlighted] ? `combobox-option-${highlighted}` : undefined}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            openList();
          }}
          onFocus={() => openList()}
          onBlur={() => onValueCommit?.(value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            'min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10',
            className
          )}
        />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className={cn('z-50 max-h-72 w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-900')}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-neutral-400 dark:text-slate-500">{emptyLabel}</div>
          ) : (
            <ul role="listbox" aria-label={ariaLabel}>
              {filtered.slice(0, 50).map((item, index) => (
                <li
                  key={item.value + index}
                  id={`combobox-option-${index}`}
                  role="option"
                  aria-selected={index === highlighted}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => selectItem(item)}
                  className={cn(
                    'flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm text-neutral-700 outline-none dark:text-slate-300',
                    index === highlighted && 'bg-neutral-100 text-neutral-900 dark:bg-slate-800 dark:text-white'
                  )}
                >
                  {item.label}
                  {item.description ? (
                    <span className="ml-auto pl-4 font-mono text-xs tabular-nums text-neutral-400 dark:text-slate-500">
                      {item.description}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}