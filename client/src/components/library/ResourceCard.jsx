import { Link } from 'react-router-dom';
import { Folder, Pin } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useLibrary } from '../../context/LibraryContext.jsx';
import { cn } from '../../lib/cn.js';
import { formatDate, relativeTime } from '../../lib/format.js';
import { StatusBadge, TypeBadge } from './Badges.jsx';
import { TYPE_ICONS, TYPE_TINT, resourceDetail, resourcePath } from './resourceMeta.js';

function Favicon({ resource, size = 16 }) {
  const Icon = TYPE_ICONS[resource.type];
  if (resource.type === 'link' && resource.link?.faviconUrl) {
    return (
      <img
        src={resource.link.faviconUrl}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        loading="lazy"
        className="rounded-[3px]"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
    );
  }
  return <Icon size={size} aria-hidden />;
}

function Snippet({ resource }) {
  const text = resource.match?.snippet || resource.excerpt || resource.link?.description;
  if (!text) return <p className="font-ui text-sm text-ink-faint italic">No preview available yet.</p>;
  return (
    <p className="line-clamp-3 font-ui text-[0.88rem] leading-relaxed text-ink-muted library:font-body library:text-[0.95rem]">
      {resource.match?.page ? <span className="mr-1 font-mono text-[0.7rem] text-accent">p.{resource.match.page}</span> : null}
      {text}
    </p>
  );
}

function TagLine({ tags }) {
  const { theme } = useTheme();
  if (!tags.length) return null;
  if (theme === 'library') {
    return <p className="truncate font-body text-[0.85rem] text-ink-faint italic">{tags.map((t) => t.name).join(' · ')}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 4).map((t) => (
        <span
          key={t.id}
          className={cn(
            'truncate',
            theme === 'studio' && 'rounded-full bg-sunken px-2 py-0.5 font-ui text-[0.72rem] text-ink-muted',
            theme === 'lab' && 'font-mono text-[0.68rem] text-ink-faint'
          )}
        >
          {theme === 'lab' ? `#${t.name}` : t.name}
        </span>
      ))}
      {tags.length > 4 && <span className="font-ui text-[0.72rem] text-ink-faint">+{tags.length - 4}</span>}
    </div>
  );
}

/** Grid card. Each theme gets a different silhouette, not just different colours. */
export default function ResourceCard({ resource, index = 0 }) {
  const { theme } = useTheme();
  const { collectionById } = useLibrary();
  const collection = resource.collectionId ? collectionById.get(resource.collectionId) : null;
  const tint = TYPE_TINT[resource.type];
  const Icon = TYPE_ICONS[resource.type];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(index, 12) * 0.03 }}>
      <Link
        to={resourcePath(resource)}
        className={cn('mm-card mm-card-interactive group flex h-full flex-col overflow-hidden', theme === 'library' && 'mm-card-ruled')}
        aria-label={`${resource.title}${resource.pinned ? ' (pinned)' : ''}`}
      >
        {/* ── Library: catalogue card with a coloured spine and catalogue number ── */}
        {theme === 'library' && (
          <div className="relative flex flex-1 flex-col gap-3 p-5 pl-6">
            <span className={cn('absolute top-3 bottom-3 left-0 w-[5px] rounded-r-[2px]', tint.bar)} aria-hidden />
            <div className="flex items-center justify-between gap-2">
              <TypeBadge type={resource.type} />
              <span className="font-display text-[0.8rem] text-ink-faint italic">№ {resource.id.slice(-4).toUpperCase()}</span>
            </div>
            <h3 className="line-clamp-2 font-display text-[1.45rem] leading-tight text-ink group-hover:text-accent">{resource.title}</h3>
            <Snippet resource={resource} />
            <div className="mt-auto space-y-1.5 border-t border-dashed border-line-strong pt-3">
              <TagLine tags={resource.tags} />
              <div className="flex items-center justify-between gap-2 font-body text-[0.8rem] text-ink-faint">
                <span className="truncate">{collection ? collection.name : resourceDetail(resource)}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <StatusBadge resource={resource} />
                  {resource.pinned && <Pin size={13} className="text-accent" aria-label="Pinned" />}
                  {formatDate(resource.updatedAt, { day: 'numeric', month: 'short' })}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Studio: colour-blocked header module ── */}
        {theme === 'studio' && (
          <>
            <div className={cn('relative flex h-24 items-end justify-between p-4', tint.bg)}>
              {resource.type === 'link' && resource.link?.imageUrl ? (
                <img src={resource.link.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-90" onError={(e) => (e.currentTarget.style.display = 'none')} />
              ) : (
                <Icon size={64} strokeWidth={1.25} className={cn('absolute -top-2 -right-2 opacity-25', tint.fg)} aria-hidden />
              )}
              <span className="relative flex h-9 w-9 items-center justify-center rounded-[12px] bg-surface shadow-card">
                <span className={tint.fg}>
                  <Favicon resource={resource} />
                </span>
              </span>
              {resource.pinned && (
                <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-surface text-accent shadow-card">
                  <Pin size={13} aria-label="Pinned" />
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2.5 p-4">
              <div className="flex items-center gap-2">
                <TypeBadge type={resource.type} withIcon={false} />
                <StatusBadge resource={resource} />
              </div>
              <h3 className="line-clamp-2 font-display text-[1.15rem] leading-snug text-ink">{resource.title}</h3>
              <Snippet resource={resource} />
              <div className="mt-auto flex flex-col gap-2 pt-1">
                <TagLine tags={resource.tags} />
                <div className="flex items-center justify-between font-ui text-[0.75rem] text-ink-faint">
                  <span className="flex min-w-0 items-center gap-1 truncate">
                    {collection && <Folder size={12} aria-hidden />}
                    {collection ? collection.name : resourceDetail(resource)}
                  </span>
                  <span className="shrink-0">{relativeTime(resource.updatedAt)}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Lab: instrument readout with a mono header strip ── */}
        {theme === 'lab' && (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-line bg-sunken/60 px-4 py-2">
              <span className="flex items-center gap-2">
                <TypeBadge type={resource.type} />
                <span className="font-mono text-[0.62rem] text-ink-faint">{resource.id.slice(-6)}</span>
              </span>
              <span className="flex items-center gap-2">
                {resource.pinned && <Pin size={11} className="text-accent-3" aria-label="Pinned" />}
                <StatusBadge resource={resource} showReady />
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2.5 p-4">
              <div className="flex items-start gap-2.5">
                <span className={cn('mt-0.5 shrink-0', tint.fg)}>
                  <Favicon resource={resource} size={15} />
                </span>
                <h3 className="line-clamp-2 font-display text-[1.05rem] leading-snug text-ink group-hover:text-accent">{resource.title}</h3>
              </div>
              <Snippet resource={resource} />
              <div className="mt-auto space-y-2 pt-1">
                <TagLine tags={resource.tags} />
                <dl className="grid grid-cols-3 gap-2 border-t border-line pt-2 font-mono text-[0.62rem] tracking-wide text-ink-faint uppercase">
                  <div>
                    <dt className="sr-only">Chunks</dt>
                    <dd>{resource.processing.chunkCount} chk</dd>
                  </div>
                  <div className="truncate">
                    <dt className="sr-only">Collection</dt>
                    <dd className="truncate">{collection ? collection.name : '—'}</dd>
                  </div>
                  <div className="text-right">
                    <dt className="sr-only">Updated</dt>
                    <dd>{new Date(resource.updatedAt).toISOString().slice(0, 10)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </>
        )}
      </Link>
    </motion.div>
  );
}

export { Favicon };
