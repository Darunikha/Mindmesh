import { useTheme } from '../../context/ThemeContext.jsx';
import { cn } from '../../lib/cn.js';

function LibraryMark({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="18.5" fill="var(--mm-accent)" />
      <circle cx="20" cy="20" r="15.5" fill="none" stroke="var(--mm-accent-ink)" strokeOpacity="0.45" strokeWidth="0.8" />
      <text x="20" y="26.5" textAnchor="middle" fontFamily="Cormorant Garamond, Georgia, serif" fontSize="19" fontStyle="italic" fontWeight="700" fill="var(--mm-accent-ink)">
        M
      </text>
    </svg>
  );
}

function StudioMark({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect x="2" y="2" width="36" height="36" rx="12" fill="var(--mm-ink)" />
      <path d="M12 26 20 13l8 13" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.6" />
      <circle cx="20" cy="13" r="4" fill="var(--mm-butter)" />
      <circle cx="12" cy="26" r="4" fill="var(--mm-accent-2)" />
      <circle cx="28" cy="26" r="4" fill="#a99bff" />
    </svg>
  );
}

function LabMark({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect x="1" y="1" width="38" height="38" rx="8" fill="var(--mm-surface-2)" stroke="var(--mm-line-strong)" />
      <g stroke="var(--mm-accent)" strokeWidth="1.3" fill="none" strokeOpacity="0.9">
        <path d="M11 27 20 12l9 15H11Z" />
        <path d="M20 12v8.5M11 27l9-6.5 9 6.5" strokeOpacity="0.45" />
      </g>
      <g fill="var(--mm-accent)">
        <circle cx="20" cy="12" r="2.4" />
        <circle cx="11" cy="27" r="2.4" />
        <circle cx="29" cy="27" r="2.4" />
        <circle cx="20" cy="20.5" r="1.6" fill="var(--mm-accent-2)" />
      </g>
    </svg>
  );
}

/** Mindmesh wordmark: each theme has its own mark and lettering. */
export default function Logo({ size = 32, showWordmark = true, className }) {
  const { theme } = useTheme();
  const Mark = theme === 'studio' ? StudioMark : theme === 'lab' ? LabMark : LibraryMark;
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Mark size={size} />
      {showWordmark && (
        <span
          className={cn(
            'text-ink',
            'library:font-display library:text-[1.6rem] library:font-semibold library:italic library:tracking-tight',
            'studio:font-display studio:text-[1.3rem] studio:font-bold studio:tracking-[-0.04em] studio:lowercase',
            'lab:font-mono lab:text-[0.82rem] lab:font-medium lab:tracking-[0.28em] lab:uppercase'
          )}
        >
          Mindmesh
        </span>
      )}
    </span>
  );
}
