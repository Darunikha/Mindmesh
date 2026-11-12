import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, Waypoints } from 'lucide-react';
import Card from '../ui/Card.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { TypeBadge } from './Badges.jsx';
import { graphApi } from '../../api/discovery.js';
import { useToast } from '../../context/ToastContext.jsx';

/** Explicit connections and content-similar items for one resource, with one-click linking. */
export default function RelatedPanel({ resourceId }) {
  const toast = useToast();
  const [data, setData] = useState(null);

  const load = () =>
    graphApi
      .related(resourceId)
      .then(setData)
      .catch(() => setData({ connected: [], similar: [] }));

  useEffect(() => {
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  const connect = async (id) => {
    try {
      await graphApi.createConnection({ sourceId: resourceId, targetId: id });
      toast.success('Connected');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="mm-eyebrow">Related</p>
        <Link to="/graph" className="inline-flex items-center gap-1 font-ui text-xs text-ink-muted hover:text-accent">
          <Waypoints size={12} aria-hidden /> Graph
        </Link>
      </div>
      {!data ? (
        <Skeleton lines={3} />
      ) : !data.connected.length && !data.similar.length ? (
        <p className="font-ui text-xs text-ink-faint">No related items yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {data.connected.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <Link2 size={12} className="shrink-0 text-accent" aria-label="Connected" />
              <Link to={`/vault/${c.id}`} className="min-w-0 flex-1 truncate font-ui text-sm text-ink hover:text-accent">
                {c.title}
              </Link>
              {c.label && <span className="truncate font-ui text-[0.7rem] text-ink-faint">{c.label}</span>}
            </li>
          ))}
          {data.similar.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <TypeBadge type={s.type} withIcon={false} className="w-14 shrink-0" />
              <Link to={`/vault/${s.id}`} className="min-w-0 flex-1 truncate font-ui text-sm text-ink-muted hover:text-accent">
                {s.title}
              </Link>
              <button type="button" onClick={() => connect(s.id)} className="rounded p-1 text-ink-faint hover:text-accent" aria-label={`Connect to ${s.title}`} title="Connect">
                <Link2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
