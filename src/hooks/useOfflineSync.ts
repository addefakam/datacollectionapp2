'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  savePendingSurvey,
  getPendingSurveys,
  getPendingCount,
  deletePendingSurvey,
  updatePendingSurveyRetry,
  PendingSurvey,
} from '@/lib/offline-store';

interface SyncState {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  syncErrors: number;
  lastSyncAttempt: string | null;
  lastSyncedAt: string | null;
}

/** How often the queue is retried while the app is open. */
const AUTO_SYNC_INTERVAL_MS = 15000;
/**
 * A record the server keeps rejecting with 4xx (invalid payload) is not worth
 * hammering forever: auto-sync stops trying after this many attempts. The
 * manual "Sync" button always tries everything, and records are never deleted
 * — no survey data is lost.
 */
const MAX_AUTO_RETRIES = 8;

export function useOfflineSync() {
  const [state, setState] = useState<SyncState>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    pendingCount: 0,
    isSyncing: false,
    syncErrors: 0,
    lastSyncAttempt: null,
    lastSyncedAt: null,
  });

  const syncLock = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setState((s) => ({ ...s, pendingCount: count }));
    } catch {
      // IndexedDB not available
    }
  }, []);

  const syncPendingSurveys = useCallback(async (manual = false) => {
    if (syncLock.current || !navigator.onLine) return { synced: 0, errors: 0 };
    syncLock.current = true;

    let pending: PendingSurvey[] = [];
    try {
      pending = await getPendingSurveys();
    } catch {
      syncLock.current = false;
      return { synced: 0, errors: 0 };
    }

    // Nothing queued — skip the isSyncing state churn entirely.
    if (pending.length === 0) {
      syncLock.current = false;
      setState((s) => (s.pendingCount === 0 ? s : { ...s, pendingCount: 0 }));
      return { synced: 0, errors: 0 };
    }

    setState((s) => ({ ...s, isSyncing: true, lastSyncAttempt: new Date().toISOString() }));

    let synced = 0;
    let errors = 0;

    for (const record of pending) {
      // Auto-sync skips records the server has repeatedly rejected (4xx).
      // Manual sync always tries everything.
      if (!manual && (record.retryCount ?? 0) >= MAX_AUTO_RETRIES) continue;
      try {
        // Route each record to the right module endpoint
        const endpoint = record.kind === 'industry' ? '/api/industries'
          : record.kind === 'health' ? '/api/healthcenters'
          : record.kind === 'education' ? '/api/educationcenters'
          : record.kind === 'agriculture' ? '/api/agriculturecenters'
          : record.kind === 'small-enterprise' ? '/api/smallenterprises'
          : record.kind === 'charity' ? '/api/charities'
          : '/api/guesthouses';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record.data),
        });

        if (response.ok) {
          await deletePendingSurvey(record.id!);
          synced++;
        } else {
          errors++;
          // Server permanently rejected the payload (validation) — count the
          // attempt so auto-sync can back off after repeated rejections.
          if (response.status >= 400 && response.status < 500 && record.id != null) {
            await updatePendingSurveyRetry(record.id);
          }
        }
      } catch {
        errors++;
      }
    }

    syncLock.current = false;

    setState((s) => ({
      ...s,
      isSyncing: false,
      syncErrors: errors,
      lastSyncedAt: synced > 0 ? new Date().toISOString() : s.lastSyncedAt,
    }));
    // Always re-read the real queue length so the badge never drifts.
    refreshPendingCount();

    return { synced, errors };
  }, [refreshPendingCount]);

  const saveOffline = useCallback(async (
    data: Record<string, unknown>,
    kind: 'guesthouse' | 'industry' | 'health' | 'education' | 'agriculture' | 'small-enterprise' | 'charity' = 'guesthouse'
  ) => {
    try {
      await savePendingSurvey(data, kind);
      await refreshPendingCount();
      // The save often happens during a brief network blip while the browser
      // still reports being online (no `online` event will ever fire in that
      // case) — retry shortly so the record flushes without user action.
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => { syncPendingSurveys(); }, 2500);
      return true;
    } catch {
      return false;
    }
  }, [refreshPendingCount, syncPendingSurveys]);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Flush the queue as soon as connectivity returns.
  useEffect(() => {
    const goOnline = () => {
      setState((s) => ({ ...s, isOnline: true }));
      syncPendingSurveys();
      refreshPendingCount();
    };
    const goOffline = () => {
      setState((s) => ({ ...s, isOnline: false }));
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [syncPendingSurveys, refreshPendingCount]);

  // Self-healing queue: retry periodically and whenever the user returns to
  // the app. This rescues records queued during a brief outage while the
  // browser stayed "online" — the `online` event alone never fires then.
  useEffect(() => {
    const trySync = () => {
      if (navigator.onLine) syncPendingSurveys();
    };
    const interval = setInterval(trySync, AUTO_SYNC_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') trySync();
    };
    window.addEventListener('focus', trySync);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', trySync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [syncPendingSurveys]);

  // Clear the post-save retry timer on unmount.
  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  return {
    ...state,
    syncPendingSurveys,
    saveOffline,
    refreshPendingCount,
  };
}
