import { useCallback, useEffect, useState } from 'react';
import { libraryApi } from '../../api/library.js';
import Button from '../ui/Button.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import Alert from '../ui/Alert.jsx';

/**
 * Shows the indexed passages exactly as they are stored for search (and, from Phase 3, for the
 * assistant). Consecutive passages overlap slightly by design.
 */
export default function ExtractedText({ resourceId, total, refreshKey }) {
  const [chunks, setChunks] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const load = useCallback(
    async (p) => {
      setStatus(p === 1 ? 'loading' : 'more');
      try {
        const res = await libraryApi.chunks(resourceId, p, 20);
        setChunks((c) => (p === 1 ? res.chunks : [...c, ...res.chunks]));
        setHasMore(res.hasMore);
        setPage(p);
        setStatus('ready');
      } catch (err) {
        setError(err.message);
        setStatus('error');
      }
    },
    [resourceId]
  );

  useEffect(() => {
    load(1);
  }, [load, refreshKey]);

  if (status === 'loading') return <Skeleton lines={8} />;
  if (status === 'error') return <Alert tone="error">{error}</Alert>;
  if (!chunks.length) return <p className="font-ui text-sm text-ink-muted">No text has been extracted.</p>;

  return (
    <div>
      <p className="mb-4 font-ui text-xs text-ink-faint lab:font-mono">
        {total} indexed {total === 1 ? 'passage' : 'passages'}. Neighbouring passages overlap slightly so ideas aren't cut in half.
      </p>
      <ol className="space-y-5">
        {chunks.map((c) => (
          <li key={c.index} className="border-l-2 border-line pl-4">
            <p className="mb-1 font-mono text-[0.68rem] tracking-wide text-ink-faint uppercase">
              #{c.index + 1}
              {c.page ? ` · page ${c.page}${c.pageEnd && c.pageEnd !== c.page ? `–${c.pageEnd}` : ''}` : ''}
              {c.heading ? ` · ${c.heading}` : ''}
            </p>
            <p className="font-body text-[0.95rem] leading-relaxed whitespace-pre-line text-ink">{c.text}</p>
          </li>
        ))}
      </ol>
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" size="sm" loading={status === 'more'} onClick={() => load(page + 1)}>
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}
