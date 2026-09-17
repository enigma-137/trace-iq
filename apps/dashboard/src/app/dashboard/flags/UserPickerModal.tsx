'use client';

import { useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { UserDetailHoverCard, UserPreviewData } from './UserDetailHoverCard';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function UserPickerModal({
  isOpen,
  onClose,
  onSelectUsers,
  initialSelectedIds = [],
  title = 'Add specific users',
  description = 'Search and select real users from this project to target directly.',
  projectId
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectUsers: (selectedUsers: UserPreviewData[]) => void;
  initialSelectedIds?: string[];
  title?: string;
  description?: string;
  projectId?: string;
}) {
  const supabase = createSupabaseBrowserClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<UserPreviewData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMap, setSelectedMap] = useState<Map<string, UserPreviewData>>(new Map());
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [hoveredUser, setHoveredUser] = useState<UserPreviewData | null>(null);
  const [hoveredAnchor, setHoveredAnchor] = useState<HTMLElement | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load initial list on open
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setFocusedIndex(-1);
      setHoveredUser(null);
      void fetchUsers('');
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      void fetchUsers(searchTerm);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchTerm, isOpen]);

  async function fetchUsers(query: string) {
    setIsLoading(true);
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const params = new URLSearchParams({ limit: '40' });
      if (query.trim()) params.set('search', query.trim());
      if (projectId) params.set('projectId', projectId);

      const res = await fetch(`${apiBaseUrl}/v1/dashboard/users/search?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.ok) {
        const json = (await res.json()) as { persons: UserPreviewData[] };
        setUsers(json.persons || []);
      }
    } catch {
      // fallback
    } finally {
      setIsLoading(false);
    }
  }

  function handleRowMouseEnter(u: UserPreviewData, el: HTMLElement) {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredUser(u);
      setHoveredAnchor(el);
    }, 60);
  }

  function handleRowMouseLeave() {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredUser(null);
      setHoveredAnchor(null);
    }, 150);
  }

  function toggleUser(user: UserPreviewData) {
    const next = new Map(selectedMap);
    const key = user.distinctId || user.id;
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.set(key, user);
    }
    setSelectedMap(next);
  }

  function handleSelectAllVisible() {
    const next = new Map(selectedMap);
    for (const u of users) {
      const key = u.distinctId || u.id;
      next.set(key, u);
    }
    setSelectedMap(next);
  }

  function handleClearSelection() {
    setSelectedMap(new Map());
  }

  function handleConfirm() {
    onSelectUsers(Array.from(selectedMap.values()));
    onClose();
  }

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + 1, users.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (focusedIndex >= 0 && focusedIndex < users.length) {
        e.preventDefault();
        toggleUser(users[focusedIndex]);
      }
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onKeyDown={handleKeyDown}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">{title}</h3>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Search Input Bar */}
        <div className="border-b border-neutral-200 px-5 py-3 dark:border-slate-800 bg-neutral-50/50 dark:bg-slate-900/30">
          <div className="relative">
            <svg
              className="absolute left-3 top-2.5 text-neutral-400 dark:text-slate-500"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              autoFocus
              placeholder="Search users by name, distinct ID, email, or traits..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-full rounded-md border border-neutral-300 bg-white pl-9 pr-3 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-slate-400"
            />
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[11px]">
            <span className="text-neutral-500 dark:text-slate-400">
              {users.length} results found
            </span>
            <div className="flex items-center gap-3 font-semibold">
              <button
                type="button"
                onClick={handleSelectAllVisible}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                Select all visible
              </button>
              {selectedMap.size > 0 ? (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="text-neutral-500 hover:underline dark:text-slate-400"
                >
                  Clear ({selectedMap.size})
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* User Rows List (Names Only) */}
        <div ref={listRef} className="flex-1 overflow-y-auto divide-y divide-neutral-100 p-2 dark:divide-slate-850 dark:divide-slate-800/60 max-h-[380px]">
          {isLoading && users.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400 dark:text-slate-500">
              Searching project users...
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500 dark:text-slate-400">
              {searchTerm ? `No users match "${searchTerm}".` : 'No identified users in this project yet.'}
            </div>
          ) : (
            users.map((user, idx) => {
              const key = user.distinctId || user.id;
              const isSelected = selectedMap.has(key) || initialSelectedIds.includes(key);
              const isFocused = focusedIndex === idx;

              return (
                <div
                  key={key}
                  tabIndex={0}
                  onFocus={(e) => {
                    setFocusedIndex(idx);
                    handleRowMouseEnter(user, e.currentTarget);
                  }}
                  onBlur={handleRowMouseLeave}
                  onMouseEnter={(e) => handleRowMouseEnter(user, e.currentTarget)}
                  onMouseLeave={handleRowMouseLeave}
                  onClick={() => toggleUser(user)}
                  className={`group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 transition ${
                    isSelected
                      ? 'bg-blue-50/70 text-blue-950 dark:bg-blue-950/40 dark:text-blue-200'
                      : isFocused
                        ? 'bg-neutral-100 dark:bg-slate-900'
                        : 'hover:bg-neutral-50 dark:hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleUser(user)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-neutral-300 text-blue-600 accent-neutral-900 dark:border-slate-700 dark:accent-white"
                    />
                    <span className="truncate text-xs font-semibold text-neutral-900 dark:text-white">
                      {user.displayName || 'Unknown user'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
                    <span className="text-[10px] text-neutral-400 dark:text-slate-500">Hover for details</span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-neutral-400 dark:text-slate-500"
                    >
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Branched Hover Details Panel */}
        <UserDetailHoverCard
          user={hoveredUser}
          anchorEl={hoveredAnchor}
          isOpen={hoveredUser !== null && hoveredAnchor !== null}
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
          }}
          onMouseLeave={handleRowMouseLeave}
        />

        {/* Modal Sticky Footer */}
        <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-semibold text-neutral-600 dark:text-slate-400">
            {selectedMap.size} {selectedMap.size === 1 ? 'user' : 'users'} selected
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-md border border-neutral-300 px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedMap.size === 0}
              className="h-8 rounded-md bg-neutral-900 px-4 text-xs font-bold text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            >
              Add {selectedMap.size > 0 ? `${selectedMap.size} ` : ''}users
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
