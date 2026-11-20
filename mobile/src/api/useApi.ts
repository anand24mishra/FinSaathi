import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './client';

type Entry = { data: unknown; at: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
export function clearApiCache() { cache.clear(); inflight.clear(); }

export type ApiState<T> = {
  data: T | undefined;
  error: ApiError | null;
  /** First load, nothing to show yet. */
  loading: boolean;
  /** Background refresh while stale data is on screen. */
  refreshing: boolean;
  /** Data came from cache and the latest refresh failed. */
  stale: boolean;
  updatedAt: number | null;
  refetch: () => Promise<void>;
};

type Options<T> = { enabled?: boolean; pollMs?: number; fresh?: number; select?: (d: T) => T };

/** Tiny stale-while-revalidate hook. Cached data is shown instantly and refreshed in the background. */
export function useApi<T>(path: string | null, opts: Options<T> = {}): ApiState<T> {
  const key = path ?? '';
  const enabled = opts.enabled !== false && !!path;
  const cached = cache.get(key);
  const [data, setData] = useState<T | undefined>(cached?.data as T | undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled && !cached);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(cached?.at ?? null);
  const alive = useRef(true);
  const keyRef = useRef(key);
  keyRef.current = key;

  const run = useCallback(async (force: boolean) => {
    if (!enabled) return;
    const hit = cache.get(key);
    if (hit && !force && Date.now() - hit.at < (opts.fresh ?? 15000)) { setData(hit.data as T); setUpdatedAt(hit.at); setLoading(false); return; }
    if (hit) { setData(hit.data as T); setUpdatedAt(hit.at); setRefreshing(true); } else setLoading(true);
    try {
      let p = inflight.get(key) as Promise<T> | undefined;
      if (!p) { p = api.get<T>(key).finally(() => inflight.delete(key)); inflight.set(key, p); }
      const d = await p;
      cache.set(key, { data: d, at: Date.now() });
      if (alive.current && keyRef.current === key) { setData(d); setUpdatedAt(Date.now()); setError(null); }
    } catch (e) {
      if (alive.current && keyRef.current === key) setError(e instanceof ApiError ? e : new ApiError('unknown', String(e)));
    } finally {
      if (alive.current && keyRef.current === key) { setLoading(false); setRefreshing(false); }
    }
  }, [key, enabled, opts.fresh]);

  useEffect(() => {
    alive.current = true;
    const c = cache.get(key);
    setData(c?.data as T | undefined); setUpdatedAt(c?.at ?? null); setError(null);
    if (enabled) run(false); else setLoading(false);
    let t: ReturnType<typeof setInterval> | undefined;
    if (enabled && opts.pollMs) t = setInterval(() => run(true), opts.pollMs);
    return () => { alive.current = false; if (t) clearInterval(t); };
  }, [key, enabled, opts.pollMs, run]);

  const refetch = useCallback(() => run(true), [run]);
  return { data, error, loading, refreshing, stale: !!error && data !== undefined, updatedAt, refetch };
}
