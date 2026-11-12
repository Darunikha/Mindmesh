import { useEffect, useRef, useState } from 'react';
import { libraryApi } from '../api/library.js';
import { isBusy } from '../components/library/resourceMeta.js';

/**
 * While any of the given resources is queued or processing, re-fetches just those items
 * every `interval` ms and reports updates. Stops automatically when nothing is busy.
 */
export function useProcessingPoll(resources, onUpdate, interval = 2000) {
  const busyIds = (resources || []).filter(isBusy).map((r) => r.id);
  const key = busyIds.join(',');
  const cb = useRef(onUpdate);
  cb.current = onUpdate;

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    const ids = key.split(',');
    const t = setInterval(async () => {
      const results = await Promise.allSettled(ids.map((id) => libraryApi.get(id, { touch: false })));
      if (cancelled) return;
      results.forEach((r) => r.status === 'fulfilled' && cb.current(r.value.resource));
    }, interval);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [key, interval]);
}

export function useDebouncedValue(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay, setV]);
  return v;
}

