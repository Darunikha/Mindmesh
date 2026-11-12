import { ExternalLink, Globe } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import ExtractedText from '../../components/library/ExtractedText.jsx';
import { isBusy } from '../../components/library/resourceMeta.js';

export default function LinkView({ resource }) {
  const l = resource.link;
  const href = l.finalUrl || l.url;
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {l.imageUrl && (
          <img src={l.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="max-h-64 w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
        )}
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line bg-surface-2">
            {l.faviconUrl ? (
              <img src={l.faviconUrl} alt="" width={20} height={20} referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = 'none')} />
            ) : (
              <Globe size={18} className="text-ink-muted" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-ui text-xs text-ink-faint lab:font-mono">{l.siteName || l.domain}</p>
            <p className="mt-1 font-ui text-[0.95rem] leading-relaxed text-ink-muted">{l.description || 'No description was provided by this page.'}</p>
            <p className="mt-2 truncate font-mono text-[0.72rem] text-ink-faint">{href}</p>
          </div>
          <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="mm-btn mm-btn-secondary shrink-0">
            <ExternalLink size={16} aria-hidden />
            Open original
          </a>
        </div>
      </Card>

      <Card className="p-5 sm:p-8">
        <p className="mm-eyebrow mb-4">Extracted page text</p>
        {isBusy(resource) ? (
          <p className="font-ui text-sm text-ink-muted">Fetching the page…</p>
        ) : resource.processing.status === 'failed' ? (
          <p className="font-ui text-sm text-ink-muted">The page text could not be retrieved. The link itself is saved. See the processing panel for the reason.</p>
        ) : (
          <ExtractedText resourceId={resource.id} total={resource.processing.chunkCount} refreshKey={resource.processing.completedAt} />
        )}
      </Card>
    </div>
  );
}
