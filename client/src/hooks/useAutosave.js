import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Debounced autosave with a single in-flight request.
 * - `markDirty(patch)` merges a change into the pending patch and schedules a save.
 * - Changes made while a save is in flight are saved right after it finishes.
 * - `flush()` saves immediately (Ctrl/Cmd+S, leaving the page).
 * - Warns before unloading the tab with unsaved changes.
 *
 * `save(patch)` must resolve on success and throw on failure. Throw an error with
 * `code === 'NOTE_CONFLICT'` to enter the conflict state (no automatic retries).
 */
export function useAutosave(save, { delay = 900 } = {}) {
  const [state, setState] = useState('saved'); // saved | dirty | saving | error | conflict
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [error, setError] = useState(null);
  const pending = useRef(null);
  const timer = useRef(null);
  const inFlight = useRef(null);
  const saveRef = useRef(save);
  const stateRef = useRef(state);
  saveRef.current = save;
  stateRef.current = state;

  const run = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current) return inFlight.current;
    if (!pending.current || stateRef.current === 'conflict') return undefined;
    const patch = pending.current;
    pending.current = null;
    setState('saving');
    inFlight.current = (async () => {
      try {
        await saveRef.current(patch);
        setLastSavedAt(new Date());
        setError(null);
        setState(pending.current ? 'dirty' : 'saved');
      } catch (err) {
        // Put the failed changes back so the next attempt includes them.
        pending.current = { ...patch, ...(pending.current || {}) };
        setError(err);
        setState(err?.code === 'NOTE_CONFLICT' ? 'conflict' : 'error');
      } finally {
        inFlight.current = null;
      }
    })();
    await inFlight.current;
    if (pending.current && stateRef.current !== 'conflict' && stateRef.current !== 'error') {
      timer.current = setTimeout(run, 50);
    }
    return undefined;
  }, []);

  const markDirty = useCallback(
    (patch) => {
      pending.current = { ...(pending.current || {}), ...patch };
      if (stateRef.current === 'conflict') return;
      setState((s) => (s === 'saving' ? s : 'dirty'));
      clearTimeout(timer.current);
      timer.current = setTimeout(run, delay);
    },
    [delay, run]
  );

  const flush = useCallback(() => run(), [run]);
  const retry = useCallback(() => {
    setState('dirty');
    stateRef.current = 'dirty';
    return run();
  }, [run]);
  const discardPending = useCallback(() => {
    pending.current = null;
    clearTimeout(timer.current);
    setState('saved');
  }, []);
  const hasUnsaved = () => Boolean(pending.current) || stateRef.current === 'saving';

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (pending.current || inFlight.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      clearTimeout(timer.current);
      // Leaving the editor inside the app: save whatever is pending.
      if (pending.current && stateRef.current !== 'conflict') run();
    };
  }, [run]);

  return { state, lastSavedAt, error, markDirty, flush, retry, discardPending, hasUnsaved };
}
