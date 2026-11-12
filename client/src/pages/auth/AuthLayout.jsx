import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext.jsx';
import { THEMES, THEME_IDS } from '../../themes/registry.js';
import Logo from '../../components/theme/Logo.jsx';
import InterestConstellation from '../../components/theme/InterestConstellation.jsx';
import { cn } from '../../lib/cn.js';

const HERO = {
  library: {
    kicker: 'Est. for curious minds',
    title: (
      <>
        A quiet room for <em>everything</em> you learn.
      </>
    ),
    body: 'Keep notes, papers and passing thoughts on one well-kept shelf. Return to them with a librarian who has read every page.',
  },
  studio: {
    kicker: 'Your thinking studio',
    title: (
      <>
        Collect ideas. <em>Connect</em> them. Make something.
      </>
    ),
    body: 'A flexible, modular space for notes, research and documents, with an AI collaborator that knows your work.',
  },
  lab: {
    kicker: 'Knowledge system // v0.1',
    title: (
      <>
        Map what you know. Query it <em>instantly</em>.
      </>
    ),
    body: 'Semantic search, retrieval-grounded answers and a live graph of your research, all in one instrument.',
  },
};

const DEMO_TOPICS = ['Memory', 'Language', 'Systems', 'Design', 'Ethics', 'Data'];

/** Shared frame for sign-in and sign-up. Lets visitors try each theme before creating an account. */
export default function AuthLayout({ children }) {
  const { theme, setTheme } = useTheme();
  const hero = HERO[theme];

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="mm-backdrop" aria-hidden />

      <section
        className={cn(
          'relative hidden flex-col justify-between overflow-hidden p-12 lg:flex',
          'library:border-r library:border-line-strong library:bg-bg-elev',
          'studio:m-4 studio:rounded-[32px] studio:bg-ink studio:text-surface',
          'lab:border-r lab:border-line'
        )}
      >
        <Logo size={36} className="studio:[&_span]:text-surface" />

        <motion.div key={theme} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative max-w-lg">
          <p className="mm-eyebrow mb-4 studio:!text-[#c9c3ff]">{hero.kicker}</p>
          <h1 className="mm-display text-5xl leading-[1.02] library:text-6xl studio:text-surface studio:[&_em]:!bg-none studio:[&_em]:text-[#f4c95d] lab:text-[2.75rem]">
            {hero.title}
          </h1>
          <p className="mt-5 max-w-md font-ui text-[1.02rem] leading-relaxed text-ink-muted studio:text-[#bdb8cc]">{hero.body}</p>

          {theme === 'library' && (
            <div className="mt-10 flex items-center gap-4 text-ink-faint" aria-hidden>
              <span className="h-px flex-1 bg-line-strong" />
              <span className="font-display text-2xl italic">❦</span>
              <span className="h-px flex-1 bg-line-strong" />
            </div>
          )}
          {theme === 'lab' && (
            <div className="mt-8 h-56 max-w-md" aria-hidden>
              <InterestConstellation name="you" interests={DEMO_TOPICS} width={420} height={220} />
            </div>
          )}
        </motion.div>

        {theme === 'studio' && (
          <div className="pointer-events-none absolute -right-10 bottom-24 flex rotate-[-8deg] gap-3" aria-hidden>
            <span className="h-28 w-28 rounded-[28px] bg-[#f4c95d]" />
            <span className="mt-10 h-24 w-24 rounded-full bg-[#e8775a]" />
            <span className="h-32 w-20 rounded-[24px] bg-[#a99bff]" />
          </div>
        )}

        <div className="relative">
          <p className="mm-eyebrow mb-3 studio:!text-[#bdb8cc]">Try a different room</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Preview theme">
            {THEME_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={theme === id}
                onClick={() => setTheme(id)}
                className={cn(
                  'mm-chip',
                  'studio:border-white/15 studio:bg-white/5 studio:text-[#d8d4e6] studio:hover:text-white',
                  'studio:aria-checked:border-[#f4c95d] studio:aria-checked:text-[#f4c95d]',
                  'aria-checked:border-accent aria-checked:bg-accent-soft aria-checked:text-accent'
                )}
              >
                <span className="flex gap-0.5" aria-hidden>
                  {THEMES[id].swatches.slice(0, 3).map((c) => (
                    <span key={c} className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: c }} />
                  ))}
                </span>
                {THEMES[id].name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="relative flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 lg:hidden">
          <Logo size={34} />
        </div>
        <div className="w-full max-w-[420px]">{children}</div>
        <div className="mt-8 flex gap-2 lg:hidden" role="radiogroup" aria-label="Preview theme">
          {THEME_IDS.map((id) => (
            <button key={id} type="button" role="radio" aria-checked={theme === id} onClick={() => setTheme(id)} className="mm-chip aria-checked:border-accent aria-checked:text-accent">
              {THEMES[id].name.replace('The ', '')}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
