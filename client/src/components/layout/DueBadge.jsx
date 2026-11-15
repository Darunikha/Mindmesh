import { dueBadge, useStudy } from '../../context/StudyContext.jsx';

/** Small count of flashcards due now, shown beside "Review" in the navigation. */
export default function DueBadge() {
  const { stats } = useStudy();
  const label = dueBadge(stats?.due);
  if (!label) return null;
  return (
    <span
      className="inline-flex min-w-[1.3rem] items-center justify-center rounded-pill bg-accent px-1.5 font-ui text-[0.68rem] leading-5 font-semibold text-accent-ink library:rounded-[3px] library:font-body library:text-[0.74rem] lab:rounded-[4px] lab:border lab:border-accent/50 lab:bg-accent-soft lab:font-mono lab:text-accent"
      role="status"
      aria-label={`${stats.due} flashcard${stats.due === 1 ? '' : 's'} due`}
    >
      {label}
    </span>
  );
}
