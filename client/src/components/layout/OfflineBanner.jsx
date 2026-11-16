import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useOnline } from '../../hooks/useOnline.js';
import { cn } from '../../lib/cn.js';

/**
 * A small floating notice shown while the browser is offline, and briefly "Back online"
 * when the connection returns. It floats over the page, so it never shifts the layout.
 */
export default function OfflineBanner() {
  const online = useOnline();
  const [justBack, setJustBack] = useState(false);
  const wasOnline = useRef(true);

  useEffect(() => {
    let timer;
    if (!wasOnline.current && online) {
      setJustBack(true);
      timer = setTimeout(() => setJustBack(false), 3000);
    }
    wasOnline.current = online;
    return () => clearTimeout(timer);
  }, [online]);

  if (online && !justBack) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'mm-card fixed top-3 left-1/2 z-[96] flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 px-4 py-2 font-ui text-sm text-ink shadow-raised',
        'library:rounded-[4px] studio:rounded-full lab:font-mono lab:text-xs lab:uppercase lab:tracking-wider',
        online ? 'border-success/40' : 'border-danger/40'
      )}
    >
      {online ? <Wifi size={15} className="shrink-0 text-success" aria-hidden /> : <WifiOff size={15} className="shrink-0 text-danger" aria-hidden />}
      <span className="font-semibold whitespace-nowrap">{online ? 'Back online' : 'You’re offline'}</span>
      {!online && <span className="hidden text-ink-muted sm:inline">Some actions won’t work until you reconnect.</span>}
    </div>
  );
}
