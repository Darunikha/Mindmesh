import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import ExtractedText from '../../components/library/ExtractedText.jsx';
import { libraryApi } from '../../api/library.js';
import { useToast } from '../../context/ToastContext.jsx';
import { cn } from '../../lib/cn.js';
import { isBusy } from '../../components/library/resourceMeta.js';

function Tabs({ value, onChange, tabs }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-line px-3">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            '-mb-px border-b-2 px-3 py-2.5 font-ui text-sm transition-colors lab:font-mono lab:text-xs lab:uppercase lab:tracking-wider',
            value === t.value ? 'border-accent text-ink font-semibold' : 'border-transparent text-ink-muted hover:text-ink'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** Document preview: the original PDF or image inline, plus the extracted, indexed text for every format. */
export default function DocumentView({ resource }) {
  const toast = useToast();
  const isPdf = resource.file.extension === '.pdf';
  const imageType = IMAGE_TYPES[resource.file.extension];
  const previewType = isPdf ? 'application/pdf' : imageType;
  const [tab, setTab] = useState(previewType ? 'preview' : 'text');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!previewType || tab !== 'preview' || previewUrl) return undefined;
    const controller = new AbortController();
    libraryApi
      .fileBlob(resource.id, { signal: controller.signal })
      .then((blob) => setPreviewUrl(URL.createObjectURL(new Blob([blob], { type: previewType }))))
      .catch((err) => err.name !== 'AbortError' && setPreviewError(err.message));
    return () => controller.abort();
  }, [previewType, tab, previewUrl, resource.id]);

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  const download = async () => {
    setDownloading(true);
    try {
      const blob = await libraryApi.fileBlob(resource.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = resource.file.originalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const tabs = [...(previewType ? [{ value: 'preview', label: 'Preview' }] : []), { value: 'text', label: 'Extracted text' }];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 pr-3">
        <Tabs value={tab} onChange={setTab} tabs={tabs} />
        <div className="flex gap-1">
          {isPdf && previewUrl && (
            <Button variant="ghost" size="sm" iconOnly icon={ExternalLink} aria-label="Open PDF in a new tab" title="Open in new tab" onClick={() => window.open(previewUrl, '_blank', 'noopener')} />
          )}
          <Button variant="ghost" size="sm" icon={Download} loading={downloading} onClick={download}>
            Download
          </Button>
        </div>
      </div>
      <div className={tab === 'preview' ? '' : 'p-5 sm:p-8'}>
        {tab === 'preview' &&
          (previewError ? (
            <div className="p-6">
              <Alert tone="error">{previewError}</Alert>
            </div>
          ) : previewUrl && imageType ? (
            <div className="flex justify-center bg-sunken p-4">
              <img src={previewUrl} alt={`Uploaded image: ${resource.title}`} className="max-h-[75vh] max-w-full object-contain" />
            </div>
          ) : previewUrl ? (
            <iframe title={`Preview of ${resource.title}`} src={previewUrl} className="h-[75vh] w-full border-0 bg-sunken" />
          ) : (
            <div className="p-6">
              <Skeleton className="h-[60vh]" />
            </div>
          ))}
        {tab === 'text' &&
          (isBusy(resource) ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <FileText size={24} className="animate-pulse text-accent" aria-hidden />
              <p className="font-ui text-sm text-ink-muted">Extracting text…</p>
              {previewType && <p className="font-ui text-xs text-ink-faint">Scanned pages and images can take a minute or two.</p>}
            </div>
          ) : resource.processing.status === 'failed' ? (
            <p className="font-ui text-sm text-ink-muted">No text available. See the processing panel for details.</p>
          ) : (
            <ExtractedText resourceId={resource.id} total={resource.processing.chunkCount} refreshKey={resource.processing.completedAt} />
          ))}
      </div>
    </Card>
  );
}
