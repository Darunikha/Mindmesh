import { NavLink } from 'react-router-dom';
import { LogOut, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { cn } from '../../lib/cn.js';
import Logo from '../theme/Logo.jsx';
import { NAV_SECTIONS, ROMAN } from './navigation.js';

const TINT_BG = {
  accent: 'studio:bg-accent-soft studio:text-accent',
  'accent-2': 'studio:bg-accent-2-soft studio:text-accent-2',
  'accent-3': 'studio:bg-accent-3-soft studio:text-accent-3',
};

function itemClasses(active) {
  return cn(
    'group relative flex w-full items-center gap-3 font-ui text-[0.92rem] transition-colors',
    // Library: index-card entries with a leather bookmark on the active item
    'library:rounded-[4px] library:px-3 library:py-2 library:text-[1rem]',
    active ? 'library:bg-surface library:text-ink library:shadow-card' : 'library:text-ink-muted library:hover:text-ink library:hover:bg-surface-2',
    // Studio: soft pill rows with coloured icon chips
    'studio:rounded-[14px] studio:px-2 studio:py-1.5',
    active ? 'studio:bg-sunken studio:text-ink studio:font-semibold' : 'studio:text-ink-muted studio:hover:bg-surface-2 studio:hover:text-ink',
    // Lab: instrument rows with a signal bar
    'lab:rounded-[6px] lab:px-3 lab:py-2 lab:text-[0.86rem]',
    active ? 'lab:bg-accent-soft lab:text-ink' : 'lab:text-ink-muted lab:hover:bg-surface lab:hover:text-ink'
  );
}

function NavIcon({ icon: Icon, tint, active }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        'studio:h-8 studio:w-8 studio:rounded-[10px]',
        TINT_BG[tint],
        active && 'library:text-accent lab:text-accent'
      )}
    >
      <Icon size={17} strokeWidth={1.75} aria-hidden />
    </span>
  );
}

function ActiveMarker({ active }) {
  if (!active) return null;
  return (
    <>
      <span className="absolute top-1/2 -left-3 hidden h-6 w-1.5 -translate-y-1/2 rounded-r-[2px] bg-accent library:block" aria-hidden />
      <span className="absolute top-2 bottom-2 left-0 hidden w-[2px] rounded-full bg-accent lab:block" aria-hidden />
    </>
  );
}

export default function Sidebar({ onNavigate }) {
  const { user, logout } = useAuth();
  const { theme } = useTheme();

  return (
    <nav aria-label="Main" className="flex h-full flex-col">
      <div className="px-5 pt-6 pb-5 lab:px-4">
        <Logo size={theme === 'lab' ? 28 : 32} />
      </div>
      {theme === 'library' && <hr className="mm-rule mx-5 mb-2" />}

      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-3 lab:space-y-5">
        {NAV_SECTIONS.map((section, si) => (
          <div key={section.id}>
            <p className="mm-eyebrow mb-2 px-3 lab:px-3">
              {theme === 'library' && <span className="mr-1.5 font-semibold">{ROMAN[si]}.</span>}
              {section.titles[theme]}
            </p>
            <ul className="space-y-0.5 studio:space-y-1">
              {section.items.map((item) => (
                <li key={item.to}>
                  {item.phase ? (
                    <span
                      className={cn(itemClasses(false), 'cursor-not-allowed opacity-55 hover:!bg-transparent')}
                      aria-disabled="true"
                      title={`${item.label} arrives in Phase ${item.phase}`}
                    >
                      <NavIcon icon={item.icon} tint={item.tint} />
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="rounded-pill border border-line px-1.5 py-px font-mono text-[0.6rem] tracking-wider text-ink-faint uppercase">
                        P{item.phase}
                      </span>
                    </span>
                  ) : (
                    <NavLink to={item.to} end={item.end} onClick={onNavigate} className={({ isActive }) => itemClasses(isActive)}>
                      {({ isActive }) => (
                        <>
                          <ActiveMarker active={isActive} />
                          <NavIcon icon={item.icon} tint={item.tint} active={isActive} />
                          <span className="flex-1 truncate">{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line p-3 library:mx-2 studio:border-0">
        <NavLink to="/settings" onClick={onNavigate} className={({ isActive }) => itemClasses(isActive)}>
          {({ isActive }) => (
            <>
              <ActiveMarker active={isActive} />
              <NavIcon icon={Settings} tint="accent-2" active={isActive} />
              <span className="flex-1 truncate">Settings</span>
            </>
          )}
        </NavLink>

        <div
          className={cn(
            'mt-2 flex items-center gap-3 px-3 py-2',
            'studio:rounded-[16px] studio:bg-sunken studio:px-2.5',
            'lab:rounded-[6px] lab:border lab:border-line'
          )}
        >
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center font-display text-sm font-bold',
              'library:rounded-full library:border library:border-line-strong library:bg-accent-soft library:text-accent library:italic',
              'studio:rounded-[10px] studio:bg-ink studio:text-surface',
              'lab:rounded-[5px] lab:bg-accent-soft lab:font-mono lab:text-xs lab:text-accent'
            )}
            aria-hidden
          >
            {(user?.name || '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-ui text-sm font-semibold text-ink">{user?.name}</p>
            <p className="truncate font-ui text-xs text-ink-faint lab:font-mono lab:text-[0.68rem]">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-control p-1.5 text-ink-faint transition-colors hover:bg-surface hover:text-ink"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}
