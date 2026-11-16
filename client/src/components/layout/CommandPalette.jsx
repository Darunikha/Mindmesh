import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeft, FolderTree, Search, Settings, Tag } from 'lucide-react';
import { NAV_SECTIONS } from './navigation.js';
import { searchApi } from '../../api/discovery.js';
import { TYPE_ICONS, TYPE_LABELS } from '../library/resourceMeta.js';
import { useTheme } from '../../context/ThemeContext.jsx';
import { cn } from '../../lib/cn.js';

export const OPEN_PALETTE_EVENT = 'mm:open-palette';
export const openPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));

const PAGES = [
  ...NAV_SECTIONS.flatMap((s) => s.items.filter((i) => !i.phase).map((i) => ({ kind: 'Page', label: i.label, to: i.to, icon: i.icon }))),
  { kind: 'Page', label: 'Settings', to: '/settings/profile', icon: Settings },
];

const matches = (text, q) => text.toLowerCase().includes(q.toLowerCase());

/**
 * Ctrl/Cmd+K quick-jump. Type to filter pages and actions; with two or more characters it also
 * looks up your notes, documents, links, collections and topics. Arrow keys + Enter to go.
 */
export default function CommandPalette() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState({ resources: [], collections: [], tags: [] });
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const restoreRef = useRef(null);
  const listId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, toggle);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, toggle);
    };
  }, []);

  useEffect(() => {
    if (open) {
      restoreRef.current = document.activeElement;
      setQuery('');
      setFound({ resources: [], collections: [], tags: [] });
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        clearTimeout(t);
        document.body.style.overflow = prev;
        restoreRef.current?.focus?.();
      };
    }
    return undefined;
  }, [open]);

  // Look up the user's own items once they've typed a couple of characters.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setFound({ resources: [], collections: [], tags: [] });
      return undefined;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchApi
        .suggest(q, { signal: ctrl.signal })
        .then((r) => setFound({ resources: r.resources || [], collections: r.collections || [], tags: r.tags || [] }))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, open]);

  const results = useMemo(() => {
    const q = query.trim();
    const pages = (q ? PAGES.filter((p) => matches(p.label, q)) : PAGES).map((p) => ({ ...p, key: `p:${p.to}` }));
    const items = found.resources.map((r) => ({ key: `r:${r.id}`, kind: TYPE_LABELS[theme]?.[r.type] || 'Item', label: r.title || 'Untitled', to: `/vault/${r.id}`, icon: TYPE_ICONS[r.type] || Search }));
    const cols = found.collections.map((c) => ({ key: `c:${c.id}`, kind: 'Collection', label: c.name, to: `/vault?collection=${c.id}`, icon: FolderTree }));
    const tags = found.tags.map((t) => ({ key: `t:${t.id}`, kind: 'Topic', label: t.name, to: `/vault?tags=${t.id}`, icon: Tag }));
    const all = q ? [...items, ...cols, ...tags, ...pages] : pages;
    if (q) all.push({ key: 'search', kind: 'Search', label: `Search everything for “${q}”`, to: `/search?q=${encodeURIComponent(q)}`, icon: Search });
    return all;
  }, [query, found, theme]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, listId]);

  const go = (item) => {
    if (!item) return;
    close();
    navigate(item.to);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === 'Tab') {
      e.preventDefault(); // keep focus in the search box
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[95] flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] lab:bg-black/60" onClick={close} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Quick jump"
            className="mm-card relative w-full max-w-xl overflow-hidden p-0 shadow-raised"
            initial={{ y: -12, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={18} className="shrink-0 text-ink-faint" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
                aria-autocomplete="list"
                aria-label="Jump to a page, note, collection or topic"
                placeholder="Jump to a page, note, collection or topic…"
                maxLength={60}
                className="h-14 min-w-0 flex-1 bg-transparent font-ui text-base text-ink outline-none placeholder:text-ink-faint"
              />
              <kbd className="hidden rounded-control border border-line px-1.5 py-0.5 font-mono text-[0.68rem] text-ink-faint sm:block">Esc</kbd>
            </div>
            <ul id={listId} role="listbox" aria-label="Results" className="max-h-[min(55vh,26rem)] overflow-y-auto p-2">
              {results.map((r, i) => {
                const Icon = r.icon;
                return (
                  <li
                    key={r.key}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => i !== active && setActive(i)}
                    onClick={() => go(r)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-control px-3 py-2.5 font-ui text-sm', i === active ? 'bg-sunken text-ink' : 'text-ink-muted')}
                  >
                    <Icon size={16} className="shrink-0 text-accent" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    <span className="shrink-0 font-mono text-[0.68rem] tracking-wider text-ink-faint uppercase">{r.kind}</span>
                    {i === active && <CornerDownLeft size={13} className="shrink-0 text-ink-faint" aria-hidden />}
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-line px-4 py-2 font-ui text-xs text-ink-faint" aria-hidden>
              ↑ ↓ to move · Enter to open · Esc to close
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
