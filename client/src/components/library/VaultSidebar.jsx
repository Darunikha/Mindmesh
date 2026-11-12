import { Link } from 'react-router-dom';
import { Folder, FolderOpen, Inbox, Layers, Pin, Settings2 } from 'lucide-react';
import { useLibrary } from '../../context/LibraryContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { cn } from '../../lib/cn.js';
import Skeleton from '../ui/Skeleton.jsx';

function NavItem({ active, onClick, icon: Icon, label, count, depth = 0 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      style={{ paddingLeft: `${0.6 + depth * 0.9}rem` }}
      className={cn(
        'flex w-full items-center gap-2 rounded-control py-1.5 pr-2 text-left font-ui text-sm transition-colors',
        active ? 'bg-accent-soft text-ink font-semibold' : 'text-ink-muted hover:bg-sunken hover:text-ink'
      )}
    >
      <Icon size={15} className={active ? 'text-accent' : undefined} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && <span className="font-mono text-[0.68rem] text-ink-faint">{count}</span>}
    </button>
  );
}

/** Collection and tag navigation for the vault. Selecting an entry updates the URL filters. */
export default function VaultSidebar({ filters, setFilters }) {
  const { flatCollections, unfiledCount, tags, loading } = useLibrary();
  const { theme } = useTheme();
  const total = flatCollections.reduce((n, c) => n + c.count, 0) + unfiledCount;
  const selectedTags = filters.tags;

  const toggleTag = (id) =>
    setFilters({ tags: selectedTags.includes(id) ? selectedTags.filter((t) => t !== id) : [...selectedTags, id] });

  return (
    <div className="space-y-6">
      <section aria-labelledby="vault-nav-title">
        <p id="vault-nav-title" className="mm-eyebrow mb-2 px-1">
          {theme === 'library' ? 'Shelves' : theme === 'lab' ? 'Index' : 'Browse'}
        </p>
        <div className="space-y-0.5">
          <NavItem icon={Layers} label="All items" count={total} active={!filters.collection && !filters.pinned} onClick={() => setFilters({ collection: null, pinned: null })} />
          <NavItem icon={Pin} label="Pinned" active={filters.pinned === 'true'} onClick={() => setFilters({ pinned: filters.pinned === 'true' ? null : 'true', collection: null })} />
          <NavItem icon={Inbox} label="Unfiled" count={unfiledCount} active={filters.collection === 'none'} onClick={() => setFilters({ collection: 'none', pinned: null })} />
        </div>
      </section>

      <section aria-labelledby="vault-collections-title">
        <div className="mb-2 flex items-center justify-between px-1">
          <p id="vault-collections-title" className="mm-eyebrow">
            Collections
          </p>
          <Link to="/collections" className="rounded-control p-1 text-ink-faint hover:text-accent" aria-label="Manage collections and tags" title="Manage collections and tags">
            <Settings2 size={14} />
          </Link>
        </div>
        {loading ? (
          <div className="space-y-2 px-1">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        ) : flatCollections.length ? (
          <div className="space-y-0.5">
            {flatCollections.map((c) => (
              <NavItem
                key={c.id}
                icon={filters.collection === c.id ? FolderOpen : Folder}
                label={c.name}
                count={c.count}
                depth={c.depth}
                active={filters.collection === c.id}
                onClick={() => setFilters({ collection: c.id, pinned: null })}
              />
            ))}
          </div>
        ) : (
          <p className="px-1 font-ui text-xs text-ink-faint">
            No collections yet.{' '}
            <Link to="/collections" className="text-accent hover:underline">
              Create one
            </Link>
          </p>
        )}
      </section>

      <section aria-labelledby="vault-tags-title">
        <p id="vault-tags-title" className="mm-eyebrow mb-2 px-1">
          Tags
        </p>
        {tags?.length ? (
          <div className="flex flex-wrap gap-1.5 px-1">
            {tags.map((t) => (
              <button key={t.id} type="button" className="mm-chip !py-0.5 !text-[0.78rem]" aria-pressed={selectedTags.includes(t.id)} onClick={() => toggleTag(t.id)}>
                {theme === 'lab' ? `#${t.name}` : t.name}
                <span className="font-mono text-[0.62rem] opacity-60">{t.count}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-1 font-ui text-xs text-ink-faint">Tags you add to items appear here.</p>
        )}
      </section>
    </div>
  );
}
