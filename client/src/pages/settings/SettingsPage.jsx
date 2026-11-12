import { NavLink, Navigate, useParams } from 'react-router-dom';
import { Brain, LibraryBig, Palette, Shield, UserRound, IdCard } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader.jsx';
import ProfileSection from './ProfileSection.jsx';
import AccountSection from './AccountSection.jsx';
import AppearanceSection from './AppearanceSection.jsx';
import AiSection from './AiSection.jsx';
import LibrarySection from './LibrarySection.jsx';
import SecuritySection from './SecuritySection.jsx';
import { cn } from '../../lib/cn.js';

const TABS = [
  { id: 'profile', label: 'Profile', icon: UserRound, Component: ProfileSection },
  { id: 'account', label: 'Account', icon: IdCard, Component: AccountSection },
  { id: 'appearance', label: 'Appearance', icon: Palette, Component: AppearanceSection },
  { id: 'ai', label: 'AI assistant', icon: Brain, Component: AiSection },
  { id: 'library', label: 'Knowledge library', icon: LibraryBig, Component: LibrarySection },
  { id: 'security', label: 'Security', icon: Shield, Component: SecuritySection },
];

export default function SettingsPage() {
  const { tab = 'profile' } = useParams();
  const active = TABS.find((t) => t.id === tab);
  if (!active) return <Navigate to="/settings/profile" replace />;
  const { Component } = active;

  return (
    <>
      <PageHeader eyebrow="Settings" title={active.label} description="Manage your profile, preferences and account security." />
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-1 lg:flex-col">
            {TABS.map((t) => (
              <li key={t.id} className="shrink-0">
                <NavLink
                  to={`/settings/${t.id}`}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-control px-3 py-2 font-ui text-sm transition-colors',
                      isActive ? 'bg-surface text-ink shadow-card lab:bg-accent-soft lab:shadow-none' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                    )
                  }
                >
                  <t.icon size={16} aria-hidden />
                  {t.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          <Component />
        </div>
      </div>
    </>
  );
}
