'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '@privy-io/react-auth';

/** fetch() with the caller's Privy access token attached. */
export async function apiFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data as T;
}

interface Options {
  /**
   * Refetch when the tab regains focus. On by default: approvals arrive from
   * other people, so coming back to a tab should not show stale state.
   */
  refreshOnFocus?: boolean;
  /** Refetch on an interval while the tab is visible. */
  pollMs?: number;
}

/**
 * GET a path once the user is authenticated, with loading and error state.
 *
 * Refreshes are silent — `loading` only goes true for the first load, so a
 * background refetch never flashes a skeleton over content the user is reading.
 */
export function useApi<T>(path: string | null, options: Options = {}) {
  const { refreshOnFocus = true, pollMs } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedOnce = useRef(false);

  const fetchNow = useCallback(
    async (silent: boolean) => {
      if (!path) return;
      if (!silent) setLoading(true);
      try {
        setData(await apiFetch<T>(path));
        setError(null);
        loadedOnce.current = true;
      } catch (e) {
        // A failed background refresh should not wipe out what is on screen.
        if (!silent || !loadedOnce.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [path],
  );

  const reload = useCallback(() => fetchNow(true), [fetchNow]);

  useEffect(() => {
    void fetchNow(false);
  }, [fetchNow]);

  useEffect(() => {
    if (!path || !refreshOnFocus) return;

    const refresh = () => {
      if (document.visibilityState === 'visible') void fetchNow(true);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [path, refreshOnFocus, fetchNow]);

  useEffect(() => {
    if (!path || !pollMs) return;

    const timer = setInterval(() => {
      // Don't poll a tab nobody is looking at.
      if (document.visibilityState === 'visible') void fetchNow(true);
    }, pollMs);
    return () => clearInterval(timer);
  }, [path, pollMs, fetchNow]);

  return { data, error, loading, reload };
}
