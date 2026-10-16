'use client';

import { useState } from 'react';

// Collapsible JSON tree. Objects/arrays deeper than `defaultDepth` start collapsed
// so large payloads stay scannable; strings that were redacted keep their marker.

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}

function Primitive({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-neutral-400 dark:text-slate-500">null</span>;
  if (typeof value === 'string') {
    const redacted = value === '[REDACTED]';
    return (
      <span className={redacted ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}>
        {JSON.stringify(value)}
      </span>
    );
  }
  if (typeof value === 'number') return <span className="text-blue-700 dark:text-blue-300">{String(value)}</span>;
  if (typeof value === 'boolean') return <span className="text-violet-700 dark:text-violet-300">{String(value)}</span>;
  return <span>{String(value)}</span>;
}

function Node({ name, value, depth, defaultDepth }: { name?: string; value: unknown; depth: number; defaultDepth: number }) {
  const [open, setOpen] = useState(depth < defaultDepth);
  const label = name !== undefined ? <span className="text-neutral-500 dark:text-slate-400">{name}: </span> : null;

  if (!isContainer(value)) {
    return (
      <div className="whitespace-pre-wrap break-all" style={{ paddingLeft: depth * 14 }}>
        {label}
        <Primitive value={value} />
      </div>
    );
  }

  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
  const [openChar, closeChar] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];

  if (entries.length === 0) {
    return (
      <div style={{ paddingLeft: depth * 14 }}>
        {label}
        <span className="text-neutral-400 dark:text-slate-500">
          {openChar}
          {closeChar}
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full text-left hover:bg-neutral-100 dark:hover:bg-slate-800/60"
        style={{ paddingLeft: depth * 14 }}
        aria-expanded={open}
      >
        <span className="inline-block w-3 text-neutral-400 dark:text-slate-500">{open ? '▾' : '▸'}</span>
        {label}
        <span className="text-neutral-400 dark:text-slate-500">
          {open ? openChar : `${openChar} ${entries.length} ${Array.isArray(value) ? 'items' : 'keys'} ${closeChar}`}
        </span>
      </button>
      {open ? (
        <>
          {entries.map(([key, inner]) => (
            <Node key={key} name={Array.isArray(value) ? undefined : key} value={inner} depth={depth + 1} defaultDepth={defaultDepth} />
          ))}
          <div className="text-neutral-400 dark:text-slate-500" style={{ paddingLeft: depth * 14 + 12 }}>
            {closeChar}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function JsonViewer({ value, defaultDepth = 2 }: { value: unknown; defaultDepth?: number }) {
  return (
    <div className="max-h-[420px] overflow-auto rounded border border-neutral-200 bg-neutral-50 p-2.5 font-mono text-[11.5px] leading-5 text-neutral-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
      <Node value={value} depth={0} defaultDepth={defaultDepth} />
    </div>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded border border-neutral-200 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {copied ? 'Copied' : label}
    </button>
  );
}
