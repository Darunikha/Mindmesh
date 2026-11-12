import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import Sidebar from './Sidebar.jsx';
import Logo from '../theme/Logo.jsx';
import { cn } from '../../lib/cn.js';

/**
 * Responsive application frame.
 * Desktop: a persistent sidebar whose silhouette differs per theme
 * (bound ledger, floating module, instrument rail). Mobile: top bar plus slide-over drawer.
 */
export default function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="relative min-h-dvh">
      <div className="mm-backdrop" aria-hidden />
      <a href="#main" className="mm-btn mm-btn-primary sr-only z-50 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden w-[264px] lg:block',
          'library:border-r library:border-line-strong library:bg-bg-elev',
          'studio:inset-y-3 studio:left-3 studio:w-[252px] studio:rounded-[28px] studio:bg-surface studio:shadow-card',
          'lab:w-[240px] lab:border-r lab:border-line lab:bg-bg-elev/90 lab:backdrop-blur'
        )}
      >
        {/* Library: a stitched spine along the binding edge */}
        <span className="absolute inset-y-0 right-1.5 hidden w-px border-r border-dashed border-line-strong library:block" aria-hidden />
        <Sidebar />
      </aside>

      {/* Mobile top bar */}
      <header
        className={cn(
          'sticky top-0 z-30 flex items-center justify-between border-b border-line px-4 py-3 lg:hidden',
          'library:bg-bg-elev/95 studio:bg-surface/90 lab:bg-bg-elev/90 backdrop-blur'
        )}
      >
        <Logo size={28} />
        <button type="button" className="mm-btn mm-btn-ghost mm-btn-icon" onClick={() => setDrawerOpen(true)} aria-label="Open navigation" aria-expanded={drawerOpen}>
          <Menu size={20} />
        </button>
      </header>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              aria-hidden
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[min(86vw,300px)] border-r border-line bg-bg-elev shadow-raised lg:hidden studio:bg-surface"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
              aria-label="Navigation"
            >
              <button
                type="button"
                className="mm-btn mm-btn-ghost mm-btn-icon mm-btn-sm absolute top-5 right-3"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
              >
                <X size={18} />
              </button>
              <Sidebar onNavigate={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main id="main" className="relative z-10 lg:pl-[var(--mm-sidebar-offset)]">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
