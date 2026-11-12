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

/** Document preview: the original PDF inline, plus the extracted, indexed text for every format. */
export default function DocumentView({ resource }) {
  const toast = useToast();
  const isPdf = resource.file.extension === '.pdf';
  const [tab, setTab] = useState(isPdf ? 'preview' : 'text');
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!isPdf || tab !== 'preview' || pdfUrl) return undefined;
    const controller = new AbortController();
    libraryApi
      .fileBlob(resource.id, { signal: controller.signal })
      .then((blob) => setPdfUrl(URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))))
      .catch((err) => err.name !== 'AbortError' && setPdfError(err.message));
    return () => controller.abort();
  }, [isPdf, tab, pdfUrl, resource.id]);

  useEffect(() => () => pdfUrl && URL.revokeObjectURL(pdfUrl), [pdfUrl]);

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

  const tabs = [...(isPdf ? [{ value: 'preview', label: 'Preview' }] : []), { value: 'text', label: 'Extracted text' }];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 pr-3">
        <Tabs value={tab} onChange={setTab} tabs={tabs} />
        <div className="flex gap-1">
          {pdfUrl && (
            <Button variant="ghost" size="sm" iconOnly icon={ExternalLink} aria-label="Open PDF in a new tab" title="Open in new tab" onClick={() => window.open(pdfUrl, '_blank', 'noopener')} />
          )}
          <Button variant="ghost" size="sm" icon={Download} loading={downloading} onClick={download}>
            Download
          </Button>
        </div>
      </div>
      <div className={tab === 'preview' ? '' : 'p-5 sm:p-8'}>
        {tab === 'preview' &&
          (pdfError ? (
            <div className="p-6">
              <Alert tone="error">{pdfError}</Alert>
            </div>
          ) : pdfUrl ? (
            <iframe title={`Preview of ${resource.title}`} src={pdfUrl} className="h-[75vh] w-full border-0 bg-sunken" />
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
