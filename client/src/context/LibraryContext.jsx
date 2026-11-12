import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { collectionsApi, tagsApi } from '../api/library.js';

const LibraryContext = createContext(null);

/** Builds a depth-annotated, alphabetically ordered flat list from parent links. */
export function flattenTree(collections) {
  const children = new Map();
  for (const c of collections) {
    const key = c.parentId || 'root';
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(c);
  }
  const out = [];
  const walk = (key, depth, path) => {
    for (const c of (children.get(key) || []).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = [...path, c.name];
      out.push({ ...c, depth, path: p.join(' / '), hasChildren: children.has(c.id) });
      walk(c.id, depth + 1, p);
    }
  };
  walk('root', 0, []);
  return out;
}

/**
 * Shared collections and tags for the signed-in user, so the sidebar, vault, editor and
 * dialogs stay in sync after any change.
 */
export function LibraryProvider({ children }) {
  const [collections, setCollections] = useState(null);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [tags, setTags] = useState(null);
  const [error, setError] = useState(null);

  const refreshCollections = useCallback(async () => {
    try {
      const data = await collectionsApi.list();
      setCollections(data.collections);
      setUnfiledCount(data.unfiledCount);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const refreshTags = useCallback(async () => {
    try {
      setTags((await tagsApi.list()).tags);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const refreshAll = useCallback(() => Promise.all([refreshCollections(), refreshTags()]), [refreshCollections, refreshTags]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const value = useMemo(() => {
    const flat = collections ? flattenTree(collections) : [];
    return {
      collections,
      flatCollections: flat,
      collectionById: new Map(flat.map((c) => [c.id, c])),
      unfiledCount,
      tags,
      tagById: new Map((tags || []).map((t) => [t.id, t])),
      error,
      loading: collections === null || tags === null,
      refreshCollections,
      refreshTags,
      refreshAll,
    };
  }, [collections, unfiledCount, tags, error, refreshCollections, refreshTags, refreshAll]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used inside LibraryProvider');
  return ctx;
}
