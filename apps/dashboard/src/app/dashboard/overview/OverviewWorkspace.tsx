'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type WidgetSize = 'sm' | 'md' | 'lg';

/** One card the Overview can show. The page renders `node` on the server; this file only arranges it. */
export interface OverviewWidget {
  id: string;
  title: string;
  description: string;
  category: 'Metrics' | 'Observability' | 'Activity' | 'Audience';
  node: ReactNode;
  defaultSize: WidgetSize;
  /** Sizes the card still reads well at. */
  sizes: WidgetSize[];
}

interface Layout {
  /** Visible cards, in order. Everything else is in the "Add card" list. */
  visible: string[];
  sizes: Record<string, WidgetSize>;
}

const STORAGE_KEY = 'traceiq-overview-layout-v1';

// Four columns on wide screens: a small card is one, medium two, large the full row.
const SPAN: Record<WidgetSize, string> = {
  sm: 'sm:col-span-1',
  md: 'sm:col-span-2',
  lg: 'sm:col-span-2 xl:col-span-4'
};

const SIZE_LABEL: Record<WidgetSize, string> = { sm: 'S', md: 'M', lg: 'L' };
const SIZE_NAME: Record<WidgetSize, string> = { sm: 'Small', md: 'Medium', lg: 'Full width' };

function readLayout(): Layout | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Layout> | null;
    if (!parsed || !Array.isArray(parsed.visible)) return null;
    return { visible: parsed.visible.filter((id) => typeof id === 'string'), sizes: parsed.sizes ?? {} };
  } catch {
    return null;
  }
}

function writeLayout(layout: Layout | null): void {
  try {
    if (layout) localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the layout still applies until the page reloads.
  }
}

export function OverviewWorkspace({
  widgets,
  defaultVisible,
  toolbar
}: {
  widgets: OverviewWidget[];
  defaultVisible: string[];
  /** Controls shown left of the customize buttons, such as the time range. */
  toolbar?: ReactNode;
}) {
  const byId = useMemo(() => new Map(widgets.map((widget) => [widget.id, widget])), [widgets]);
  const fallback = useMemo<Layout>(
    () => ({ visible: defaultVisible.filter((id) => byId.has(id)), sizes: {} }),
    [defaultVisible, byId]
  );
  const [layout, setLayout] = useState<Layout>(fallback);
  // The saved layout lives in this browser only, so wait for it before showing
  // cards rather than flashing the default set first.
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    const saved = readLayout();
    if (saved) setLayout({ visible: saved.visible.filter((id) => byId.has(id)), sizes: saved.sizes });
    setReady(true);
  }, [byId]);

  const update = useCallback((next: (current: Layout) => Layout) => {
    setLayout((current) => {
      const value = next(current);
      writeLayout(value);
      return value;
    });
  }, []);

  const sizeOf = (widget: OverviewWidget): WidgetSize => {
    const saved = layout.sizes[widget.id];
    return saved && widget.sizes.includes(saved) ? saved : widget.defaultSize;
  };

  const remove = (id: string) => update((current) => ({ ...current, visible: current.visible.filter((entry) => entry !== id) }));
  const add = (id: string) =>
    update((current) => ({ ...current, visible: current.visible.includes(id) ? current.visible : [...current.visible, id] }));
  const resize = (id: string, size: WidgetSize) => update((current) => ({ ...current, sizes: { ...current.sizes, [id]: size } }));
  const move = (id: string, target: string) =>
    update((current) => {
      if (id === target) return current;
      const without = current.visible.filter((entry) => entry !== id);
      const index = without.indexOf(target);
      if (index < 0) return current;
      // Dropping onto a card that sat after the dragged one places it after; otherwise before.
      const after = current.visible.indexOf(id) < current.visible.indexOf(target);
      without.splice(after ? index + 1 : index, 0, id);
      return { ...current, visible: without };
    });
  const step = (id: string, by: -1 | 1) =>
    update((current) => {
      const index = current.visible.indexOf(id);
      const target = index + by;
      if (index < 0 || target < 0 || target >= current.visible.length) return current;
      const next = [...current.visible];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, visible: next };
    });
  const reset = () => {
    writeLayout(null);
    setLayout(fallback);
  };

  const visible = layout.visible.map((id) => byId.get(id)).filter((widget): widget is OverviewWidget => Boolean(widget));
  const hidden = widgets.filter((widget) => !layout.visible.includes(widget.id));

  return (
    <section aria-labelledby="overview-analytics" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="overview-analytics" className="text-[15px] font-semibold text-neutral-900 dark:text-white">
          Analytics
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          <div className="relative">
            <IconButton label="Add card" onClick={() => setAdding((open) => !open)} active={adding}>
              <path d="M8 3.5v9M3.5 8h9" />
            </IconButton>
            {adding ? (
              <AddCardMenu
                hidden={hidden}
                onAdd={(id) => {
                  add(id);
                }}
                onReset={() => {
                  reset();
                  setAdding(false);
                }}
                onClose={() => setAdding(false)}
              />
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            aria-pressed={editing}
            className={
              editing
                ? 'inline-flex h-8 items-center rounded-md bg-neutral-900 px-3 text-xs font-medium text-white dark:bg-white dark:text-slate-950'
                : 'inline-flex h-8 items-center rounded-md border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900'
            }
          >
            {editing ? 'Done' : 'Customize'}
          </button>
        </div>
      </div>

      {editing ? (
        <p className="text-xs text-neutral-500 dark:text-slate-400">
          Drag cards to reorder them, pick a size, or remove what you don&apos;t need. Changes save in this browser.
        </p>
      ) : null}

      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 ${ready ? '' : 'invisible'}`}>
        {visible.map((widget, index) => {
          const size = sizeOf(widget);
          return (
            <div
              key={widget.id}
              className={`${SPAN[size]} flex min-w-0 flex-col ${dragging === widget.id ? 'opacity-40' : ''}`}
              draggable={editing}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', widget.id);
                setDragging(widget.id);
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => {
                if (editing && dragging) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData('text/plain') || dragging;
                if (id) move(id, widget.id);
                setDragging(null);
              }}
            >
              {editing ? (
                <WidgetToolbar
                  widget={widget}
                  size={size}
                  first={index === 0}
                  last={index === visible.length - 1}
                  onResize={(next) => resize(widget.id, next)}
                  onRemove={() => remove(widget.id)}
                  onStep={(by) => step(widget.id, by)}
                />
              ) : null}
              <div
                className={`min-w-0 flex-1 *:h-full ${editing ? 'pointer-events-none select-none rounded-xl outline-dashed outline-1 outline-offset-2 outline-neutral-300 dark:outline-slate-700' : ''}`}
              >
                {widget.node}
              </div>
            </div>
          );
        })}

        {ready && visible.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-neutral-300 px-6 py-12 text-center dark:border-slate-700">
            <p className="text-sm font-medium text-neutral-800 dark:text-slate-200">No cards on your Overview</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">Add the metrics you want to see here.</p>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-4 inline-flex h-8 items-center rounded-md bg-neutral-900 px-3 text-xs font-medium text-white dark:bg-white dark:text-slate-950"
            >
              Add card
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function WidgetToolbar({
  widget,
  size,
  first,
  last,
  onResize,
  onRemove,
  onStep
}: {
  widget: OverviewWidget;
  size: WidgetSize;
  first: boolean;
  last: boolean;
  onResize: (size: WidgetSize) => void;
  onRemove: () => void;
  onStep: (by: -1 | 1) => void;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-1 dark:border-slate-800 dark:bg-slate-900">
      <span className="flex min-w-0 cursor-grab items-center gap-1.5 text-[11px] font-medium text-neutral-600 active:cursor-grabbing dark:text-slate-300">
        <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-neutral-400" fill="currentColor">
          <circle cx="6" cy="4" r="1.1" />
          <circle cx="10" cy="4" r="1.1" />
          <circle cx="6" cy="8" r="1.1" />
          <circle cx="10" cy="8" r="1.1" />
          <circle cx="6" cy="12" r="1.1" />
          <circle cx="10" cy="12" r="1.1" />
        </svg>
        <span className="truncate">{widget.title}</span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        <ToolbarButton label={`Move ${widget.title} earlier`} disabled={first} onClick={() => onStep(-1)}>
          ←
        </ToolbarButton>
        <ToolbarButton label={`Move ${widget.title} later`} disabled={last} onClick={() => onStep(1)}>
          →
        </ToolbarButton>
        {widget.sizes.length > 1 ? (
          <span role="group" aria-label="Card size" className="ml-1 inline-flex rounded border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-950">
            {widget.sizes.map((option) => (
              <button
                key={option}
                type="button"
                title={SIZE_NAME[option]}
                aria-label={`${SIZE_NAME[option]} size`}
                aria-pressed={option === size}
                onClick={() => onResize(option)}
                className={
                  option === size
                    ? 'h-5 w-5 rounded-[3px] bg-neutral-900 text-[10px] font-semibold text-white dark:bg-white dark:text-slate-950'
                    : 'h-5 w-5 text-[10px] font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                }
              >
                {SIZE_LABEL[option]}
              </button>
            ))}
          </span>
        ) : null}
        <ToolbarButton label={`Remove ${widget.title}`} onClick={onRemove}>
          ×
        </ToolbarButton>
      </span>
    </div>
  );
}

function ToolbarButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-5 w-5 items-center justify-center rounded text-xs text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
    >
      {children}
    </button>
  );
}

function IconButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={active}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
        active
          ? 'border-neutral-300 bg-neutral-100 text-neutral-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white'
          : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900'
      }`}
    >
      <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
        {children}
      </svg>
    </button>
  );
}

function AddCardMenu({
  hidden,
  onAdd,
  onReset,
  onClose
}: {
  hidden: OverviewWidget[];
  onAdd: (id: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    function onPointerDown(event: MouseEvent) {
      const button = (event.target as HTMLElement).closest('[aria-label="Add card"]');
      if (ref.current && !ref.current.contains(event.target as Node) && !button) onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [onClose]);

  const groups = hidden.reduce<Record<string, OverviewWidget[]>>((acc, widget) => {
    (acc[widget.category] ??= []).push(widget);
    return acc;
  }, {});

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Add a card"
      className="absolute right-0 top-10 z-30 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950"
    >
      <div className="border-b border-neutral-100 px-3 py-2.5 dark:border-slate-800">
        <p className="text-xs font-semibold text-neutral-900 dark:text-white">Add a card</p>
        <p className="text-[11px] text-neutral-500 dark:text-slate-400">Pick what shows on your Overview.</p>
      </div>
      <div className="max-h-80 overflow-y-auto py-1">
        {hidden.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-neutral-500 dark:text-slate-400">Every card is already on your Overview.</p>
        ) : (
          Object.entries(groups).map(([category, items]) => (
            <div key={category} className="py-1">
              <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500">{category}</p>
              {items.map((widget) => (
                <button
                  key={widget.id}
                  type="button"
                  onClick={() => onAdd(widget.id)}
                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition hover:bg-neutral-50 dark:hover:bg-slate-900"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-neutral-800 dark:text-slate-200">{widget.title}</span>
                    <span className="block text-[11px] leading-snug text-neutral-500 dark:text-slate-400">{widget.description}</span>
                  </span>
                  <span aria-hidden className="mt-0.5 text-sm leading-none text-neutral-400">+</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
      <div className="border-t border-neutral-100 px-3 py-2 dark:border-slate-800">
        <button type="button" onClick={onReset} className="text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white">
          Reset to default layout
        </button>
      </div>
    </div>
  );
}
