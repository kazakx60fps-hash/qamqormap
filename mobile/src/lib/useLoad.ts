import { useCallback, useEffect, useRef, useState } from 'react';

/** Жүктеу күйі: loading / error / data және қайталау. Ескі жауаптар жаңасын баспайды. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], { enabled = true }: { enabled?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const run = useCallback(async (mode: 'load' | 'refresh' | 'silent' = 'load') => {
    if (!enabled) { setLoading(false); return; }
    const my = ++seq.current;
    if (mode === 'load') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const d = await fn();
      if (my === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (my === seq.current) setError(e);
    } finally {
      if (my === seq.current) { setLoading(false); setRefreshing(false); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
  useEffect(() => { run('load'); }, [run]);
  return { data, setData, error, loading, refreshing, reload: () => run('load'), refresh: () => run('refresh'), silent: () => run('silent') };
}
