import { useCallback, useMemo, useState } from 'react';

/**
 * Multi-select state for a list. `active` is "select mode": while on, clicking an item toggles it
 * instead of opening it. Turning the mode off clears the selection.
 */
export function useSelection() {
  const [active, setActiveState] = useState(false);
  const [ids, setIds] = useState(() => new Set());

  const clear = useCallback(() => setIds(new Set()), []);
  const setActive = useCallback((on) => {
    setActiveState(on);
    if (!on) setIds(new Set());
  }, []);
  const toggle = useCallback((id) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectAll = useCallback((all) => setIds(new Set(all)), []);
  const has = useCallback((id) => ids.has(id), [ids]);

  return useMemo(
    () => ({
      active,
      setActive,
      ids,
      count: ids.size,
      toggle,
      has,
      clear,
      selectAll,
    }),
    [active, setActive, ids, toggle, has, clear, selectAll]
  );
}
