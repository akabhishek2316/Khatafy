import { useCallback, useEffect, useRef, useState } from 'react';
import { KhError, toKhError } from '@khatafy/core';

type Entry = { data: unknown; ts: number };
const cache = new Map<string, Entry>();
const subs = new Set<(prefix: string) => void>();

/** Re-fetches every mounted query whose key starts with `prefix` (after a mutation or realtime event). */
export function invalidate(prefix = '') {
  subs.forEach((s) => s(prefix));
}
export function clearCache() {
  cache.clear();
}

export function useQuery<T>(key: string | null, fn: () => Promise<T>, opts: { onSessionExpired?: () => void } = {}) {
  const [state, setState] = useState<{ data?: T; error?: KhError; loading: boolean }>(() => {
    const c = key ? cache.get(key) : undefined;
    return c ? { data: c.data as T, loading: true } : { loading: key !== null };
  });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reqId = useRef(0);
  const expired = useRef(opts.onSessionExpired);
  expired.current = opts.onSessionExpired;

  const load = useCallback(() => {
    if (!key) return;
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true }));
    fnRef.current().then(
      (data) => {
        if (id !== reqId.current) return;
        cache.set(key, { data, ts: Date.now() });
        setState({ data, loading: false });
      },
      (e) => {
        if (id !== reqId.current) return;
        const err = toKhError(e);
        if (err.code === 'SESSION_EXPIRED') expired.current?.();
        setState((s) => ({ data: s.data, error: err, loading: false }));
      },
    );
  }, [key]);

  useEffect(() => {
    if (!key) {
      setState({ loading: false });
      return;
    }
    const c = cache.get(key);
    setState(c ? { data: c.data as T, loading: true } : { loading: true });
    load();
  }, [key, load]);

  useEffect(() => {
    if (!key) return;
    const s = (prefix: string) => {
      if (key.startsWith(prefix)) load();
    };
    subs.add(s);
    return () => void subs.delete(s);
  }, [key, load]);

  return { ...state, reload: load };
}

export type Cursor = { ts: string; id: string };

/** Keyset-paginated list: first page reloads on invalidate / filter change, "load more" appends. */
export function usePaged<T>(key: string, fetchPage: (cursor: Cursor | null) => Promise<{ items: T[]; next: Cursor | null }>, opts: { onSessionExpired?: () => void } = {}) {
  const [items, setItems] = useState<T[]>([]);
  const [next, setNext] = useState<Cursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<KhError | undefined>();
  const fnRef = useRef(fetchPage);
  fnRef.current = fetchPage;
  const req = useRef(0);
  const expired = useRef(opts.onSessionExpired);
  expired.current = opts.onSessionExpired;

  const first = useCallback(() => {
    const id = ++req.current;
    setLoading(true);
    fnRef.current(null).then(
      (p) => { if (id !== req.current) return; setItems(p.items); setNext(p.next); setError(undefined); setLoading(false); },
      (e) => { if (id !== req.current) return; const err = toKhError(e); if (err.code === 'SESSION_EXPIRED') expired.current?.(); setError(err); setLoading(false); },
    );
  }, []);
  useEffect(() => { first(); }, [key, first]);
  useEffect(() => {
    const s = (prefix: string) => { if (key.startsWith(prefix)) first(); };
    subs.add(s);
    return () => void subs.delete(s);
  }, [key, first]);

  const loadMore = useCallback(() => {
    if (!next) return;
    const id = req.current;
    setLoadingMore(true);
    fnRef.current(next).then(
      (p) => { if (id !== req.current) return; setItems((l) => [...l, ...p.items]); setNext(p.next); setLoadingMore(false); },
      (e) => { setError(toKhError(e)); setLoadingMore(false); },
    );
  }, [next]);
  return { items, next, loading, loadingMore, error, loadMore, reload: first };
}
