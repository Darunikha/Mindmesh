import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { TypeBadge } from '../library/Badges.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { cn } from '../../lib/cn.js';

function SourceCard({ c, highlighted }) {
  const { theme } = useTheme();
  return (
    <li id={`cite-${c.messageId}-${c.n}`} className={cn('mm-card scroll-mt-24 p-3', highlighted && 'mm-highlight-flash', theme === 'library' && 'mm-card-ruled')}>
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'flex h-6 min-w-6 shrink-0 items-center justify-center px-1 font-mono text-[0.7rem] font-semibold',
            'library:rounded-[3px] library:border library:border-line-strong library:font-display library:text-sm library:italic library:text-accent',
            'studio:rounded-full studio:bg-accent studio:text-accent-ink',
            'lab:rounded-[4px] lab:border lab:border-accent lab:text-accent'
          )}
          aria-hidden
        >
          {c.n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <TypeBadge type={c.resourceType} />
            {c.page && (
              <span className="font-mono text-[0.68rem] text-ink-faint">
                p. {c.page}
                {c.pageEnd && c.pageEnd !== c.page ? `–${c.pageEnd}` : ''}
              </span>
            )}
            {c.heading && <span className="truncate font-ui text-[0.72rem] text-ink-faint">§ {c.heading}</span>}
            {theme === 'lab' && c.similarity != null && (
              <span className="ml-auto flex items-center gap-1 font-mono text-[0.62rem] text-ink-faint" title="Semantic similarity">
                <span className="h-1 w-10 overflow-hidden rounded bg-sunken">
                  <span className="block h-full bg-accent" style={{ width: `${Math.max(0, Math.min(1, c.similarity)) * 100}%` }} />
                </span>
                {c.similarity.toFixed(2)}
              </span>
            )}
          </div>
          <Link to={`/vault/${c.resourceId}`} className="group mt-1 flex items-center gap-1 font-ui text-sm font-semibold text-ink hover:text-accent library:font-display library:text-base">
            <span className="truncate">{c.title}</span>
            <ArrowUpRight size={13} className="shrink-0 opacity-50 group-hover:opacity-100" aria-hidden />
            <span className="sr-only">(open source)</span>
          </Link>
          <p className="mt-1 line-clamp-3 font-body text-[0.84rem] leading-relaxed text-ink-muted library:italic">{c.excerpt}</p>
        </div>
      </div>
    </li>
  );
}

/**
 * Citation cards for one answer. Cited passages are shown; passages that were retrieved but
 * not used are available behind a toggle, so users can see exactly what the model was given.
 */
export default function SourceCards({ messageId, citations, highlighted }) {
  const [showAll, setShowAll] = useState(false);
  const cited = citations.filter((c) => c.cited);
  const other = citations.filter((c) => !c.cited);
  if (!citations.length) return null;
  return (
    <div className="mt-4">
      {cited.length > 0 && (
        <>
          <p className="mm-eyebrow mb-2">Sources cited</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {cited.map((c) => (
              <SourceCard key={c.n} c={{ ...c, messageId }} highlighted={highlighted === c.n} />
            ))}
          </ul>
        </>
      )}
      {other.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowAll((s) => !s)} className="inline-flex items-center gap-1 font-ui text-xs text-ink-muted hover:text-ink" aria-expanded={showAll}>
            <ChevronDown size={13} className={cn('transition-transform', showAll && 'rotate-180')} aria-hidden />
            {cited.length ? `${other.length} more retrieved passage${other.length === 1 ? '' : 's'} not cited` : `${other.length} retrieved passage${other.length === 1 ? '' : 's'} (none cited)`}
          </button>
          {showAll && (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {other.map((c) => (
                <SourceCard key={c.n} c={{ ...c, messageId }} highlighted={highlighted === c.n} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
