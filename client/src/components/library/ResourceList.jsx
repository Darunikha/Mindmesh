import { Link } from 'react-router-dom';
import { Pin } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useLibrary } from '../../context/LibraryContext.jsx';
import { cn } from '../../lib/cn.js';
import { formatDate, relativeTime } from '../../lib/format.js';
import { StatusBadge, TypeBadge } from './Badges.jsx';
import { Favicon } from './ResourceCard.jsx';
import { TYPE_TINT, resourceDetail, resourcePath } from './resourceMeta.js';

/**
 * List view. Library: a ruled card-catalogue ledger. Studio: soft rows with icon chips.
 * Lab: a dense data table with mono columns.
 */
export default function ResourceList({ items }) {
  const { theme } = useTheme();
  const { collectionById } = useLibrary();

  if (theme === 'lab') {
    return (
      <div className="mm-card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-line font-mono text-[0.62rem] tracking-[0.14em] text-ink-faint uppercase">
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="px-4 py-2.5 font-medium">Collection</th>
              <th className="px-4 py-2.5 font-medium">Chunks</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="group border-b border-line last:border-0 hover:bg-accent-soft">
                <td className="px-4 py-2.5">
                  <TypeBadge type={r.type} />
                </td>
                <td className="max-w-[360px] px-4 py-2.5">
                  <Link to={resourcePath(r)} className="flex items-center gap-2 font-ui text-sm text-ink group-hover:text-accent">
                    {r.pinned && <Pin size={11} className="shrink-0 text-accent-3" aria-label="Pinned" />}
                    <span className="truncate">{r.title}</span>
                  </Link>
                  {r.match?.snippet && <p className="mt-0.5 truncate font-mono text-[0.68rem] text-ink-faint">{r.match.snippet}</p>}
                </td>
                <td className="px-4 py-2.5 font-mono text-[0.72rem] text-ink-muted">{collectionById.get(r.collectionId)?.name || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-[0.72rem] text-ink-muted">{r.processing.chunkCount}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge resource={r} showReady />
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[0.72rem] text-ink-muted">{new Date(r.updatedAt).toISOString().slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (theme === 'library') {
    return (
      <div className="mm-card mm-card-ruled px-2 py-2 sm:px-4">
        <ul className="divide-y divide-dashed divide-line-strong">
          {items.map((r) => (
            <li key={r.id}>
              <Link to={resourcePath(r)} className="group grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-0.5 px-2 py-3.5 sm:grid-cols-[110px_1fr_auto]">
                <TypeBadge type={r.type} className="row-span-2 sm:row-span-1" />
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate font-display text-[1.2rem] text-ink group-hover:text-accent">
                    {r.title}
                    {r.pinned && <Pin size={12} className="shrink-0 text-accent" aria-label="Pinned" />}
                  </p>
                  <p className="truncate font-body text-[0.85rem] text-ink-faint italic">
                    {r.match?.snippet || [collectionById.get(r.collectionId)?.name, resourceDetail(r), r.tags.map((t) => t.name).join(', ')].filter(Boolean).join(' — ')}
                  </p>
                </div>
                <span className="col-start-2 flex items-center gap-2 font-body text-[0.82rem] text-ink-faint sm:col-start-auto">
                  <StatusBadge resource={r} />
                  {formatDate(r.updatedAt, { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((r) => {
        const tint = TYPE_TINT[r.type];
        return (
          <li key={r.id}>
            <Link to={resourcePath(r)} className="mm-card mm-card-interactive flex items-center gap-3 p-3 pr-4">
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]', tint.bg, tint.fg)}>
                <Favicon resource={r} size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-ui text-[0.95rem] font-semibold text-ink">
                  {r.title}
                  {r.pinned && <Pin size={12} className="shrink-0 text-accent" aria-label="Pinned" />}
                </p>
                <p className="truncate font-ui text-[0.8rem] text-ink-muted">
                  {r.match?.snippet || [collectionById.get(r.collectionId)?.name, resourceDetail(r)].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="hidden shrink-0 items-center gap-1 md:flex">
                {r.tags.slice(0, 2).map((t) => (
                  <span key={t.id} className="rounded-full bg-sunken px-2 py-0.5 font-ui text-[0.72rem] text-ink-muted">
                    {t.name}
                  </span>
                ))}
              </div>
              <StatusBadge resource={r} />
              <span className="hidden w-24 shrink-0 text-right font-ui text-[0.78rem] text-ink-faint sm:block">{relativeTime(r.updatedAt)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
