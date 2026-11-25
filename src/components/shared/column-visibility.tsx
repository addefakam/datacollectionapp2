'use client';

/**
 * Shared column-visibility controls for the Records tables.
 *
 * `useColumnVisibility` keeps the set of hidden columns in localStorage
 * (per storage key, so each module remembers its own choice) and exposes
 * `isVisible(key)` for wrapping <th>/<td> cells. At least one column always
 * stays visible. `ColumnVisibilityMenu` renders the toolbar dropdown that
 * toggles each column and resets to "show all".
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Columns3, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface ColumnDef {
  /** Stable column key (used for storage and isVisible lookups). */
  key: string;
  /** Header label shown in the visibility menu. */
  label: string;
}

export interface ColumnVisibility {
  isVisible: (key: string) => boolean;
  toggle: (key: string, value?: boolean) => void;
  showAll: () => void;
  hiddenCount: number;
  visibleCount: number;
}

const STORAGE_PREFIX = 'column-visibility:';

export function useColumnVisibility(storageKey: string, columns: ColumnDef[]): ColumnVisibility {
  // Column keys as a stable string so callers may pass inline arrays too.
  const columnKeys = useMemo(() => columns.map((c) => c.key).join(','), [columns]);
  const keySet = useMemo(() => new Set(columnKeys.split(',')), [columnKeys]);

  // Persisted hidden set, read once on mount (SSR starts with everything visible).
  const [hidden, setHidden] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set<string>();
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as unknown;
        if (Array.isArray(saved)) {
          const valid = saved.filter((k): k is string => typeof k === 'string' && keySet.has(k));
          // Never restore a fully hidden table.
          if (valid.length < keySet.size) return new Set(valid);
        }
      }
    } catch {
      // corrupt or unavailable storage — start with everything visible
    }
    return new Set<string>();
  });

  // Persist on every change.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify([...hidden]));
    } catch {
      // storage unavailable (private mode) — toggles still work for the session
    }
  }, [hidden, storageKey]);

  const isVisible = useCallback((key: string) => !hidden.has(key), [hidden]);

  const toggle = useCallback(
    (key: string, value?: boolean) => {
      setHidden((cur) => {
        const target = value ?? !cur.has(key);
        const next = new Set(cur);
        if (target) next.add(key);
        else next.delete(key);
        if (next.size >= keySet.size) return cur; // keep at least one column
        return next;
      });
    },
    [keySet.size]
  );

  const showAll = useCallback(() => setHidden(new Set()), []);

  return {
    isVisible,
    toggle,
    showAll,
    hiddenCount: hidden.size,
    visibleCount: columns.length - hidden.size,
  };
}

export function ColumnVisibilityMenu({
  columns,
  visibility,
  label,
}: {
  columns: ColumnDef[];
  visibility: ColumnVisibility;
  /** Module name shown in the menu header (e.g. "Health"). */
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Columns3 className="h-4 w-4" />
          <span className="hidden sm:inline">Columns</span>
          {visibility.hiddenCount > 0 && (
            <span className="rounded bg-teal-600 px-1 text-[10px] font-medium text-white">
              {visibility.visibleCount}/{columns.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">
          {label ? `${label} columns` : 'Table columns'} — {visibility.visibleCount}/{columns.length} shown
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-64 overflow-y-auto">
          {columns.map((c) => (
            <DropdownMenuItem key={c.key} className="gap-2" onSelect={(e) => e.preventDefault()}>
              <Checkbox
                checked={visibility.isVisible(c.key)}
                onCheckedChange={(v) => visibility.toggle(c.key, v === true)}
                className="data-[state=checked]:bg-teal-600 data-[state=checked]:border-teal-600"
              />
              <span className="text-xs">{c.label}</span>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-teal-700 focus:text-teal-700"
          onSelect={() => visibility.showAll()}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Show all / Deebi&apos;a
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
