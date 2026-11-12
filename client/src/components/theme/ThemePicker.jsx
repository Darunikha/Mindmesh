import { Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { THEMES, THEME_IDS } from '../../themes/registry.js';
import { cn } from '../../lib/cn.js';

/**
 * A tiny, self-contained rendering of each theme. It sets its own data-theme so it
 * always shows that theme's real tokens, whatever theme the page is in.
 */
function ThemePreview({ id }) {
  return (
    <div data-theme={id} className="relative h-36 overflow-hidden bg-bg" aria-hidden>
      <div className="relative flex h-full">
        <div
          className={cn(
            'flex w-14 flex-col gap-2 border-r border-line p-2.5',
            id === 'library' && 'bg-bg-elev',
            id === 'studio' && 'm-1.5 rounded-[14px] border-0 bg-surface',
            id === 'lab' && 'w-10 bg-bg-elev'
          )}
        >
          <div className="h-2 w-6 rounded-sm bg-accent" />
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn('h-1.5 rounded-sm bg-line-strong', i === 0 ? 'w-8' : 'w-6')} />
          ))}
        </div>
        <div className="flex-1 space-y-2 p-3">
          <div className="font-display text-[15px] leading-none text-ink">
            {id === 'library' && <em className="text-accent">Good evening</em>}
            {id === 'studio' && 'Hey there'}
            {id === 'lab' && <span className="font-mono text-[10px] tracking-[0.2em] text-accent">SYS · READY</span>}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="h-12 rounded-card border border-line bg-surface" />
            <div className={cn('h-12 rounded-card border border-line bg-surface', id === 'studio' && '!bg-accent-2-soft')} />
            <div className={cn('col-span-2 h-9 overflow-hidden rounded-card border border-line bg-surface', id === 'studio' && '!bg-accent-soft')}>
              {id === 'lab' && (
                <svg viewBox="0 0 120 30" className="h-full w-full">
                  <polyline points="0,22 15,18 30,20 45,10 60,14 75,6 90,12 105,8 120,10" fill="none" stroke="var(--mm-accent)" strokeWidth="1.2" />
                </svg>
              )}
              {id === 'library' && <div className="mx-3 mt-3.5 h-px bg-line-strong" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ThemePicker({ value, onChange, layout = 'grid' }) {
  return (
    <div
      role="radiogroup"
      aria-label="Visual theme"
      className={cn('grid gap-4', layout === 'grid' ? 'sm:grid-cols-3' : 'grid-cols-1')}
    >
      {THEME_IDS.map((id) => {
        const t = THEMES[id];
        const selected = value === id;
        return (
          <motion.button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.99 }}
            className={cn(
              'group overflow-hidden rounded-card border text-left transition-shadow',
              selected ? 'border-accent shadow-focus' : 'border-line hover:border-line-strong'
            )}
          >
            <ThemePreview id={id} />
            <div className="flex items-start gap-3 border-t border-line bg-surface p-4">
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg leading-tight text-ink library:text-xl">{t.name}</p>
                <p className="mt-1 font-ui text-[0.82rem] leading-snug text-ink-muted">{t.description}</p>
                <div className="mt-3 flex gap-1">
                  {t.swatches.map((c) => (
                    <span key={c} className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: c }} />
                  ))}
                </div>
              </div>
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  selected ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong'
                )}
              >
                {selected && <Check size={12} strokeWidth={3} />}
              </span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
